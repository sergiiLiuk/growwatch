# Shelly Cloud Integration (replacing MQTT) — Design

**Date:** 2026-06-17
**Status:** Approved for planning
**Supersedes:** the direct-MQTT Shelly integration (HiveMQ) and the 9-step copy-paste pairing wizard

## Problem

Real-world testing showed the direct-MQTT pairing flow is unusable for the target
user (a non-technical greenhouse owner). It requires hand-configuring a raw MQTT
client inside Shelly's firmware web UI (broker URL, shared credentials, topic
prefix, "RPC status notifications" toggles) while juggling a setup hotspot that
disappears the moment home Wi-Fi is saved — leaving the device unreachable
mid-config. No amount of wizard polish fixes the underlying model: we should not
ask a consumer to provision an MQTT client by hand.

## Goal

Replace direct MQTT with **Shelly Cloud** ingestion. The user does the easy,
well-trodden native onboarding in the official Shelly Smart Control app, then
links their Shelly account to GrowWatch **once** by pasting a cloud auth key.
GrowWatch polls Shelly Cloud for readings. The user never sees MQTT, broker URLs,
prefixes, hotspots, or `192.168.33.1`.

## Decisions (settled during brainstorming)

1. **Linking:** user pastes a Shelly Cloud **Authorization key** + **server host**
   (both on the same Shelly-app screen). No OAuth/Integrator partner approval — the
   auth-key path works today.
2. **MQTT is fully replaced**, not kept alongside. Remove the MQTT consumer, the
   `mqtt` dependency, the HiveMQ env vars, and the copy-paste wizard.
3. **Polling every ~5 minutes.** A battery H&T only reports periodically (≈hourly
   or on significant change), so 5-minute polling is effectively as fresh as the
   sensor gets, and well within free cloud API limits. No websocket.

## Non-goals

- No OAuth "Sign in with Shelly" (revisit only if Integrator partner status is
  obtained later).
- No websocket/real-time push.
- No multi-device dashboard rework — the existing one-Shelly-per-account product
  shape stays; the user links their account and selects one H&T to monitor.
- No change to anything downstream of `handleSensorData` (in-memory store, hourly
  aggregation, GraphQL subscriptions, dashboard) — those are reused unchanged.

## Shelly Cloud API (researched)

- The user generates an **Authorization cloud key** in the app: *User Settings →
  Authorization cloud key*. That screen also shows the account's **server host**
  (e.g. `shelly-XX-eu.shelly.cloud`).
- v2 status endpoint, up to 10 devices per call:
  `POST https://<HOST>/v2/devices/api/get?auth_key=<KEY>` with a JSON body listing
  device ids and a `select` of `status`/`settings`. Returns per-device status
  including temperature, humidity, battery %, and a last-update timestamp.
- Sources: https://support.shelly.cloud/en/support/solutions/articles/103000222504 ,
  https://shelly-api-docs.shelly.cloud/cloud-control-api/communication-v2/ ,
  https://kb.shelly.cloud/knowledge-base/kbuca-understanding-the-differences-between-shelly

> **Implementation note:** the exact JSON shapes of the list and status responses
> must be confirmed against a live account during implementation (the device-list
> endpoint and the H&T status field names — likely `temperature:0.tC`,
> `humidity:0.rh`, `devicepower:0.battery.percent`, mirroring the local API the old
> MQTT consumer parsed). The plan's first backend task verifies these against the
> real account before building on them.

## Architecture

```
User → Shelly Smart Control app: onboard the H&T (Wi-Fi + cloud) — native, easy
User → GrowWatch: paste auth key + server host → Connect
GrowWatch backend → Shelly Cloud listDevices → user picks the H&T → ShellyDevice saved
Every 5 min:
  shellyCloudPoller → Shelly Cloud get-status (batched per account)
    → for each reading newer than lastReportedAt:
        handleSensorData({ deviceId, temperature, humidity, userId })
        update ShellyDevice.lastSeenAt / lastReportedAt / lastBatteryPercent
Downstream (unchanged): in-memory store → hourly aggregates → GraphQL subscription → dashboard
```

## Data model

### New: `ShellyAccount` (collection `shelly_accounts`), one per user
| Field | Type | Notes |
|-------|------|-------|
| `userId` | string | unique index |
| `authKeyEnc` | string | auth key **encrypted at rest** (AES-256-GCM with `SHELLY_ENC_KEY` env) |
| `serverHost` | string | e.g. `shelly-XX-eu.shelly.cloud` |
| `status` | `'ok' \| 'auth_error'` | poller flips to `auth_error` on 401; UI prompts reconnect |
| `createdAt` | Date | |

The plaintext auth key is **never** returned through GraphQL.

### Modified: `ShellyDevice` (collection `shelly_devices`)
Drop the MQTT-era shape. New shape:
| Field | Type | Notes |
|-------|------|-------|
| `userId` | string | index |
| `deviceId` | string | **real Shelly serial** (e.g. `shellyhtg3-aabbccddeeff`), unique |
| `name` | string | from cloud, user-editable |
| `lastSeenAt` | Date? | when GrowWatch last ingested a reading |
| `lastReportedAt` | Date? | cloud's last-update timestamp of the last ingested reading (dedup key) |
| `lastBatteryPercent` | number? | 0–100 |
| `createdAt` | Date | |

## Backend components

### New: `backend/src/shellyCloud.ts`
Thin, dependency-light client (uses global `fetch`):
- `listDevices(host, authKey): Promise<ShellyCloudDevice[]>` — returns `{ id, name, type, online }`, used at connect time to show the user their H&T sensors.
- `getDevicesStatus(host, authKey, ids: string[]): Promise<ShellyCloudStatus[]>` — returns `{ id, temperature?, humidity?, batteryPercent?, reportedAt: Date }` (mapped from the raw cloud JSON; the raw field parsing lives here and nowhere else).
- Throws a typed `ShellyAuthError` on 401 so callers can mark the account.

### New: `backend/src/shellyCloudPoller.ts`
- `startShellyCloudPoller()` — `setInterval` every 5 min (plus one immediate run).
- Each tick: load all `ShellyAccount`s with `status: 'ok'`; for each, load its `ShellyDevice`s, batch their ids (≤10) into one `getDevicesStatus` call; for each status whose `reportedAt > device.lastReportedAt`, call `handleSensorData(...)` and update the device fields.
- On `ShellyAuthError`: set that account's `status='auth_error'`, skip it next time.
- On other errors: log and continue (never throw out of the tick).
- Pure helper `pickNewReadings(statuses, devices)` is unit-tested for the dedup decision.

### Modified: `backend/src/resolvers.ts`
- **Add** `connectShellyAccount(authKey, serverHost)` — validates by calling `listDevices`; on success upserts the encrypted `ShellyAccount` and returns the discovered H&T device list (id/name/online) for the user to choose from. On failure returns a clear error.
- **Add** `linkShellyDevice(deviceId, name)` — creates a `ShellyDevice` for the chosen serial (enforces the existing one-per-account rule).
- **Add** `disconnectShellyAccount` — deletes the account and its devices.
- **Update** `myShellyDevices` / `shellyToGraphQL` — drop all MQTT fields; return `{ id, deviceId, name, lastSeenAt, lastBatteryPercent, createdAt }`. Add a `shellyAccount` query returning `{ connected, status }` (never the key) so the UI knows whether to show the connect form or the device.
- **Remove** `addShellyDevice` (generated-id flavor) and all `process.env.MQTT_*` usage.

### Modified: `backend/src/schema.ts`
Drop `mqttBrokerUrl/mqttUsername/mqttPassword/mqttPrefix` from `ShellyDevice`. Add
the `connectShellyAccount`/`linkShellyDevice`/`disconnectShellyAccount` mutations,
the `shellyAccount` query, and the types they return (`ShellyAccountStatus`,
`ShellyCloudDevice`).

### Modified: `backend/src/index.ts`
Remove the `startMqttConsumer` import + call; add `startShellyCloudPoller()`.

### Deleted
`backend/src/mqttConsumer.ts`; the `mqtt` dependency in `package.json`/lockfile;
the `MQTT_*` lines in `.env.example`. Add `SHELLY_ENC_KEY` to `.env.example`.

## Frontend components

### `frontend/src/app/core/services/shelly.service.ts`
- `ShellyDevice` interface drops the MQTT fields.
- New: `shellyAccount()` query, `connectShellyAccount(authKey, serverHost)`,
  `linkShellyDevice(deviceId, name)`, `disconnectShellyAccount()` — and the
  `ShellyCloudDevice` type for the discovered list.

### Replace `shelly-pairing-wizard.component.ts` with a link flow
Three short screens (or one scrolling screen — implementer's call, the content is small):
1. "Set up your Shelly in the Shelly Smart Control app first" + app-store links.
2. Two inputs (auth key, server host) with help text on where to find them
   (*User Settings → Authorization cloud key*). **Connect** button.
3. On connect, show the discovered H&T sensors; user taps one to link → success.

### `shelly-setup.component.ts`
Show the linked device (existing card) plus a **Disconnect Shelly account** action
when an account is connected, and the "Connect" entry point when it isn't. A
`status: 'auth_error'` account shows a "reconnect needed" prompt.

### i18n
Update **both** `en.json` and `da.json`: remove the old MQTT wizard keys, add the
connect-flow copy. (Shelly-app field names like "Authorization cloud key" stay in
English in both, as they appear in the app.)

## Error handling

- **Invalid/expired key at connect:** mutation throws a user-facing message
  ("Couldn't reach Shelly Cloud with that key — double-check the key and server").
- **Key expires later:** poller catches `ShellyAuthError`, sets `auth_error`; UI
  shows reconnect prompt; no API spamming.
- **Device offline / no new report:** `lastSeenAt` simply stays old; existing
  "last seen X ago" UI covers it.
- **Duplicate readings:** `lastReportedAt` gate ensures one ingest per actual cloud
  report, regardless of poll frequency.
- **Cloud/rate errors:** logged, tick continues.

## Testing / verification

- Backend `npx tsc --noEmit` clean.
- Unit tests (the project has none here yet, but these are pure and worth it):
  - `shellyCloud` status-mapping: raw cloud JSON → `{ temperature, humidity, batteryPercent, reportedAt }`.
  - `pickNewReadings` dedup: only readings with `reportedAt > lastReportedAt` are selected.
- Frontend strict-template typecheck (`tsc -p tsconfig.app.json`) + both i18n files valid JSON.
- Manual: paste a real auth key, confirm the H&T lists, link it, confirm a reading
  appears on the dashboard within ~5 min and battery/last-seen populate.

## Operator decommission (after deploy)

- Delete the HiveMQ Cloud cluster.
- Remove the `MQTT_*` variables from Railway; add `SHELLY_ENC_KEY` (32-byte random).

## Open detail (non-blocking)

The user pastes the **server host** with the key. If implementation finds a
reliable host-discovery endpoint, the host field can be dropped — but the design
assumes it's provided.
