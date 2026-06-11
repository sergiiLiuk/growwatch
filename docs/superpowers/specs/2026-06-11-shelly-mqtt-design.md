# Shelly Integration via MQTT — Design

## Context

Phase 1 (shipped) integrated Shelly H&T Gen3 via outbound webhooks: GrowWatch generates a per-device URL with placeholder substitution; the user pastes it into Shelly's Settings → Actions and configures two webhooks (one per channel). In practice the Shelly Gen3 web UI exposes too many similar-sounding menus (Webhooks vs Outbound WebSockets vs Actions vs URL Actions) and forces non-technical users to make multiple HTTP/method/trigger choices. We hit this wall in real testing.

This spec replaces the webhook integration with **MQTT**. Shelly Gen3 exposes a single MQTT panel — broker URL, username, password, prefix, two toggles — and once configured, publishes all telemetry automatically. No per-channel actions, no per-event triggers.

## Goal

Pair a Shelly H&T Gen3 to GrowWatch by entering one MQTT config on the Shelly's web UI. Telemetry flows into the existing `SensorData` pipeline. The webhook integration is removed cleanly.

## Out of scope

- Two-way control (sending commands to the Shelly via MQTT). Pure telemetry inbound.
- Shelly Cloud OAuth.
- Migration of existing webhook devices — there's one paired device in production and it can be re-paired by hand.
- Multi-tenant broker scaling considerations. Single-user-scale broker only.
- BLE / native phone provisioning.
- Phase 2 UI cleanup (light/pressure/CO2 strip) and Phase 3 ESP32 decommission — separate specs.

## Architecture

### Infrastructure — new Railway service `mqtt`

- Container: `eclipse-mosquitto:2`
- Persistent volume mounted at `/mosquitto/data` for `passwd` and `acl` files
- Two ports exposed:
  - `1883` — internal, plain TCP, for backend ↔ broker on Railway's internal network only
  - `8883` — public, MQTT over TLS, for Shelly devices to connect from the internet
- Public hostname: `mqtt.growwatch.dk` via Railway's TCP proxy + DNS A/CNAME
- TLS cert v1: self-signed with `cert.pem` and `key.pem` baked into the image (Shelly Gen3 supports an "Allow invalid TLS certificate" checkbox). Follow-up: Let's Encrypt via DNS-01 challenge sidecar.
- `mosquitto.conf` (v1 shape):

```
listener 1883
allow_anonymous false
password_file /mosquitto/data/passwd
acl_file /mosquitto/data/acl

listener 8883
require_certificate false
cafile /mosquitto/cert/cert.pem
certfile /mosquitto/cert/cert.pem
keyfile /mosquitto/cert/key.pem
```

### Auth — password file managed by backend

- Backend writes to `passwd` and `acl` files on the shared Railway volume.
- File format:
  - `passwd` — one `username:hashedPassword` per line (use `mosquitto_passwd -b` format, bcrypt by default in v2)
  - `acl` — per-user topic permissions:
    ```
    user gw-<deviceId>
    topic readwrite gw/<deviceId>/#

    user gw-server
    topic readwrite gw/#
    ```
- **Hot reload**: backend writes the new file, then calls `mosquitto_ctrl` over MQTT control channel OR posts a "reload" request to a small internal HTTP endpoint baked into the broker container. **Decision:** ship v1 with **broker restart on auth change**. ~2-second outage per pairing event is acceptable at this scale; sophisticated reload is a follow-up.
- One admin account `gw-server` provisioned once (in the broker container's initial seed) with subscribe access to `gw/#`. Password stored in Railway env var `MQTT_SERVER_PASSWORD`.

### Topic structure

Each `ShellyDevice` is configured with `Custom MQTT prefix = gw/<deviceId>` in the Shelly's Settings → MQTT page. Shelly Gen3 then publishes:

- `gw/<deviceId>/status/temperature:0` → JSON `{"id":0,"tC":<float>,"tF":<float>}`
- `gw/<deviceId>/status/humidity:0` → JSON `{"id":0,"rh":<float>}`
- `gw/<deviceId>/status/devicepower:0` → JSON `{"id":0,"battery":{"V":<float>,"percent":<int>},"external":...}`
- `gw/<deviceId>/online` → `true`/`false` (retained last-will)

Backend subscribes to wildcard `gw/+/status/+:0` and `gw/+/online`.

### Backend MQTT consumer

New file: `backend/src/mqttConsumer.ts`. Started from `backend/src/index.ts` after MongoDB connect, before HTTP server listens.

- Connects to broker at `process.env.MQTT_INTERNAL_URL ?? 'mqtt://mqtt.railway.internal:1883'` with username `gw-server` and password `process.env.MQTT_SERVER_PASSWORD`.
- Subscribes:
  - `gw/+/status/temperature:0`
  - `gw/+/status/humidity:0`
  - `gw/+/status/devicepower:0`
  - `gw/+/online`
- Per-device **debounce buffer**: `Map<deviceId, { temperature?: number; humidity?: number; battery?: number; flushTimer?: NodeJS.Timeout }>`. Each incoming message updates the buffer and resets a 2-second timer. On flush:
  1. Look up `ShellyDevice` by `deviceId` (cached for 60s to avoid hot-path DB hits).
  2. Call `handleSensorData({ temperature, humidity, deviceId, userId })`.
  3. Update `ShellyDevice.lastSeenAt` and `lastBatteryPercent` if set.
  4. Clear the buffer entry.
- Connection lifecycle: auto-reconnect with exponential backoff. Log every reconnect.
- Boot log: `[boot] MQTT consumer: connected to mqtt://… as gw-server`.

### Auth file writer (backend helper)

New file: `backend/src/mqttAuth.ts`, exports:

```ts
export async function addMqttUser(deviceId: string, plainPassword: string): Promise<void>
export async function removeMqttUser(deviceId: string): Promise<void>
```

Both call into the broker container via a thin HTTP shim (a separate sidecar) OR — simpler — write directly to the shared Railway volume mounted at the same path on the backend, then trigger broker restart via a Railway API call.

**Decision:** v1 — backend SSHes / RPCs into the broker container is overkill. Use a different approach: the broker container exposes a tiny **internal-only HTTP endpoint** (Node script bundled into the image) at port `9000` that accepts `POST /reload-auth` and rewrites `passwd`/`acl` based on a JSON body, then signals mosquitto via `SIGHUP`. Backend calls this endpoint. Source of truth for credentials is in MongoDB (`ShellyDevice` collection); the sidecar is purely a "render this file and SIGHUP" service.

This keeps the broker decoupled from MongoDB and keeps the backend in charge.

### `ShellyDevice` model changes

Rename + add fields:

```ts
// Removed:
webhookToken: string

// Added:
mqttUsername: string    // gw-<deviceId>
mqttPassword: string    // 32-byte random, hex-encoded; stored plaintext for use by sidecar
```

`mqttPassword` is stored plaintext because the sidecar needs to know it to write the bcrypt hash to `passwd` (it doesn't have a way to recover plaintext from the stored hash to re-render the file when adding other users). Alternative: store only the bcrypt hash and append on each change. The "append on each change" model needs the sidecar to read existing entries and only modify the changed one — more code. Accept storing plaintext for v1; risk is low (broker creds are scoped per-device, exposure on DB compromise is no worse than session tokens).

### GraphQL changes

- `ShellyDevice` type:
  - Remove `webhookUrl: String!`
  - Add `mqttBrokerUrl: String!`, `mqttUsername: String!`, `mqttPassword: String!`, `mqttPrefix: String!`
- `addShellyDevice` mutation: unchanged signature, but the resolver generates `mqttPassword` instead of `webhookToken` and triggers the sidecar.
- `rotateShellyToken` → renamed `rotateShellyMqttPassword` (function preserved: generate new password, update Mongo, call sidecar).

### Pairing wizard — step 4 rewrite

Same 6 steps, but step 4's body becomes:

> While connected to the Shelly's hotspot, in a new browser tab:
>
> 1. Go to `http://192.168.33.1`
> 2. Settings → Wi-Fi → Wi-Fi 1 → enter your home Wi-Fi name and password → Save.
> 3. Settings → MQTT.
> 4. Enable MQTT: **on**
> 5. Server: paste the **broker URL** below
> 6. Client ID: leave blank
> 7. MQTT user: paste the **username** below
> 8. MQTT password: paste the **password** below
> 9. Custom MQTT prefix: paste the **prefix** below
> 10. Generic status update over MQTT: **on**
> 11. RPC status notifications over MQTT: **on**
> 12. Save.
> 13. Come back here and tap Next.

The wizard shows 4 copyable rows in step 4 (broker URL, username, password, prefix). The URL card UI from steps 3 and 4 is reused, just with multiple labelled values instead of one URL.

### What gets deleted (clean cut)

| Path | What |
|---|---|
| `backend/src/index.ts` | `POST /api/shelly/webhook` route registration |
| `backend/src/resolvers.ts` | `findShellyByToken`, `touchShelly`, `buildShellyWebhookUrl`, `generateShellyToken`, `webhookToken` field in `shellyToGraphQL` |
| `backend/src/models.ts` | `webhookToken` field on `IShellyDevice` and schema |
| `backend/src/schema.ts` | `webhookUrl` on `ShellyDevice` type |
| `frontend/src/app/core/services/shelly.service.ts` | `webhookUrl` from `ShellyDevice` interface and from GraphQL fragment |
| `frontend/public/i18n/{en,da}.json` | `shelly.copyUrl`, `shelly.copied`, `shelly.webhookUrlLabel`, `shelly.webhookUrlHint` (only if unused after wizard rewrite — they're still used in the wizard, so probably keep) |

`removeShellyDevice` resolver gains a call to `removeMqttUser` so cleanup propagates to broker.

## Migration / cutover

- Production has one paired but never-seen device. Plan does not migrate it — operator deletes it manually post-deploy and re-pairs via the new flow.
- Backend deploy order:
  1. Deploy broker service to Railway (`mqtt` + sidecar). Verify TLS connectivity from an external `mqttx` client.
  2. Deploy backend with MQTT consumer. Verify boot log shows consumer connected.
  3. Deploy frontend with new wizard. Existing device card will fail GraphQL (no `webhookUrl`); user manually deletes via the device card's 🗑 button.
  4. Re-pair via new wizard.

## Risks

- **Railway TCP proxy on port 8883** — needs verification. Railway supports TCP proxies but requires service config. If unsupported, fallback to running broker on default 1883 and accepting plaintext for v1 — acceptable for personal-scale with non-sensitive sensor data, but documented.
- **Self-signed cert UX** — Shelly Gen3's "Allow invalid TLS certificate" toggle exists in the firmware. Wizard tells user to enable it. If your firmware version lacks the toggle, fallback to plaintext 1883.
- **Sidecar approach for auth file management** — adds a small Node service in the broker image, plus an internal HTTP call from backend. Not standard but standard alternatives (mosquitto-go-auth, Dynamic Security plugin) are heavier. Sidecar is right-sized.
- **Shelly's MQTT message schema** — based on Shelly Gen3 docs. Verify on real device on first connect; consumer logs the raw payload of the first message per topic to help diagnose schema differences.

## Success criteria

- A user can complete the wizard's new step 4 (single MQTT form) without touching Shelly's Actions / Webhooks pages.
- After the Shelly publishes its first temperature reading, GrowWatch's home page shows it within ≤3 seconds.
- After `removeShellyDevice` is called, the Shelly's connection is rejected by the broker (verified by checking broker logs).
- No `POST /api/shelly/webhook` endpoint exists in the deployed backend.
- Settings page card shows `lastSeenAt` and `lastBatteryPercent` updates on every report.
