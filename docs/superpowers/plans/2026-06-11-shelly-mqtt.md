# Shelly MQTT (HiveMQ Cloud) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace Shelly webhook integration with MQTT pointed at HiveMQ Cloud Free Tier: backend subscribes as `gw-server`, every Shelly connects as the same `shelly-publisher` credential with publish-only access scoped by `gw/<deviceId>` topic prefix; wizard step 4 displays the four values (broker URL, username, password, prefix) for the user to paste into Shelly's MQTT panel.

**Architecture:** No infrastructure to build. HiveMQ Cloud runs the broker. Backend gains a `mqttConsumer.ts` that connects via the `mqtt` npm package, subscribes to `gw/+/status/+:0` and `gw/+/online`, debounces 2s per device, and bridges to existing `handleSensorData`. `ShellyDevice` drops `webhookToken` (no replacement — credentials are server-wide env vars). Wizard step 4's body switches from "create two Actions" to "fill the MQTT form with these four values".

**Tech Stack:** TypeScript, Node.js, Express, MongoDB/Mongoose, Apollo Server, Angular 21 standalone components, Transloco i18n, Tailwind v4, `mqtt` npm package (backend client), HiveMQ Cloud (broker, no code on our side).

**Note on tests:** This project has no unit-test suite in this area. Verification uses `npx tsc --noEmit` plus manual verification with `mqttx` CLI and a real device.

**Note on `npm run build`:** Do NOT run `npm run build` in the frontend during these tasks. Its prebuild hook overwrites `frontend/src/environments/environment.prod.ts`. Use `npx tsc --noEmit` only.

**Task ordering:** Tasks 1–2 are operator actions (HiveMQ signup + Railway env vars) — zero code. Tasks 3–7 form a single atomic backend cutover (don't deploy mid-way). Tasks 8–9 ship the frontend after backend is live.

---

## File map

### New files

- `backend/src/mqttConsumer.ts`

### Modified files

- `backend/package.json` and `backend/package-lock.json` — add `mqtt` dep
- `backend/.env.example`
- `backend/src/models.ts` — drop `webhookToken`
- `backend/src/schema.ts` — swap `webhookUrl` for MQTT fields; drop `rotateShellyToken`
- `backend/src/resolvers.ts` — drop webhook helpers, update `shellyToGraphQL`, drop `rotateShellyToken`
- `backend/src/index.ts` — drop webhook route, start MQTT consumer
- `frontend/src/app/core/services/shelly.service.ts` — interface + GraphQL fragment + drop `rotateToken`
- `frontend/src/app/features/settings/shelly-setup.component.ts` — drop rotate button + handler
- `frontend/src/app/features/settings/shelly-pairing-wizard.component.ts` — step 4 displays 4 values
- `frontend/public/i18n/en.json` and `da.json` — step 4 body keys + drop rotate keys

---

## Task 1: Set up HiveMQ Cloud (operator)

**Files:** None (HiveMQ dashboard work).

- [ ] **Step 1: Create HiveMQ Cloud account and cluster**

1. Go to https://www.hivemq.com/cloud/ → Sign up → choose the **Serverless Free** plan.
2. Create a new cluster. Region: EU (closest to your Railway region).
3. Note the **cluster URL** that appears (e.g. `xxxxxxxxxx.s2.eu.hivemq.cloud`).

- [ ] **Step 2: Create the two MQTT users**

In the cluster's **Access Management** section:

1. Create user `gw-server` with a random 32-byte password (e.g. `openssl rand -hex 32`). Permissions: **Subscribe-only** on topic filter `gw/#`.
2. Create user `shelly-publisher` with another random 32-byte password. Permissions: **Publish-only** on topic filters `gw/+/status/+` and `gw/+/online`.

Record both passwords — you'll add them as Railway env vars next.

---

## Task 2: Add Railway env vars (operator)

**Files:** None (Railway dashboard work).

- [ ] **Step 1: Add to the `backend` service on Railway**

In the Railway dashboard → `backend` service → Variables, add:

- `MQTT_BROKER_URL` = `mqtts://<your-cluster-host>:8883`
- `MQTT_PUBLIC_URL` = `mqtts://<your-cluster-host>:8883` (same value; this name is shown to users in the wizard)
- `MQTT_SERVER_PASSWORD` = the `gw-server` password from Task 1
- `MQTT_PUBLISHER_USERNAME` = `shelly-publisher`
- `MQTT_PUBLISHER_PASSWORD` = the `shelly-publisher` password from Task 1

Do **not** trigger a redeploy yet — the new env vars only take effect after Task 7's backend deploy ships. Setting them now means the deploy in Task 7 picks them up automatically.

---

## Task 3: Add `mqtt` dependency and `.env.example`

**Files:**
- Modify: `backend/package.json`, `backend/package-lock.json`
- Modify (or create): `backend/.env.example`

- [ ] **Step 1: Install the `mqtt` npm package**

```
cd /c/Users/Sergii/Desktop/growwatch/backend && npm install mqtt
```

- [ ] **Step 2: Add to .env.example**

If `backend/.env.example` exists, append (otherwise create with this content):

```
# MQTT broker (HiveMQ Cloud — set in Railway env in prod)
MQTT_BROKER_URL=mqtts://example.hivemq.cloud:8883
MQTT_PUBLIC_URL=mqtts://example.hivemq.cloud:8883
MQTT_SERVER_PASSWORD=devpassword
MQTT_PUBLISHER_USERNAME=shelly-publisher
MQTT_PUBLISHER_PASSWORD=devpasswordpub
```

- [ ] **Step 3: Typecheck**

```
cd /c/Users/Sergii/Desktop/growwatch/backend && npx tsc --noEmit
```
Expected: no errors. (The new dep affects runtime only; no source changes yet.)

- [ ] **Step 4: Don't commit yet** — wait for Task 7's atomic commit.

---

## Task 4: Drop `webhookToken` from `ShellyDevice` model

**Files:**
- Modify: `backend/src/models.ts`

- [ ] **Step 1: Update the interface**

Find:

```ts
export interface IShellyDevice extends Document {
    userId: string;
    deviceId: string;
    name: string;
    webhookToken: string;
    lastSeenAt?: Date;
    lastBatteryPercent?: number;
    createdAt: Date;
}
```

Replace with (drop `webhookToken` line):

```ts
export interface IShellyDevice extends Document {
    userId: string;
    deviceId: string;
    name: string;
    lastSeenAt?: Date;
    lastBatteryPercent?: number;
    createdAt: Date;
}
```

- [ ] **Step 2: Update the schema**

Find:

```ts
const shellyDeviceSchema = new Schema<IShellyDevice>(
    {
        userId: { type: String, required: true, index: true },
        deviceId: { type: String, required: true },
        name: { type: String, required: true },
        webhookToken: { type: String, required: true, unique: true, index: true },
        lastSeenAt: { type: Date },
        lastBatteryPercent: { type: Number, min: 0, max: 100 },
        createdAt: { type: Date, default: Date.now },
    },
    { collection: 'shelly_devices' }
);
```

Replace with:

```ts
const shellyDeviceSchema = new Schema<IShellyDevice>(
    {
        userId: { type: String, required: true, index: true },
        deviceId: { type: String, required: true },
        name: { type: String, required: true },
        lastSeenAt: { type: Date },
        lastBatteryPercent: { type: Number, min: 0, max: 100 },
        createdAt: { type: Date, default: Date.now },
    },
    { collection: 'shelly_devices' }
);

shellyDeviceSchema.index({ deviceId: 1 }, { unique: true });
```

(Add a unique index on `deviceId` — it was implicitly covered before by the unique `webhookToken`. Now it needs its own.)

- [ ] **Step 3: Typecheck**

```
cd /c/Users/Sergii/Desktop/growwatch/backend && npx tsc --noEmit
```
Expected: fails in `resolvers.ts` because `webhookToken` is referenced. Task 5 fixes that.

---

## Task 5: Resolvers — drop webhook code, update `shellyToGraphQL`

**Files:**
- Modify: `backend/src/resolvers.ts`

- [ ] **Step 1: Delete webhook helpers**

Find and delete these blocks entirely:

```ts
const SHELLY_BACKEND_BASE = process.env.SHELLY_BACKEND_BASE_URL ?? 'https://growwatch.dk';

function generateShellyToken(): string {
    return crypto.randomBytes(32).toString('hex');
}

function buildShellyWebhookUrl(token: string, deviceId: string): string {
    // ...placeholder URL builder...
}

export async function findShellyByToken(token: string): Promise<IShellyDevice | null> {
    // ...
}

export async function touchShelly(id: any, batteryPercent: number | null): Promise<void> {
    // ...
}
```

Keep `generateShellyDeviceId()` — still needed for new pairings.

- [ ] **Step 2: Update `shellyToGraphQL`**

Find:

```ts
function shellyToGraphQL(d: IShellyDevice) {
    return {
        id: String(d._id),
        deviceId: d.deviceId,
        name: d.name,
        webhookUrl: buildShellyWebhookUrl(d.webhookToken, d.deviceId),
        lastSeenAt: d.lastSeenAt ? d.lastSeenAt.toISOString() : null,
        lastBatteryPercent: d.lastBatteryPercent ?? null,
        createdAt: d.createdAt.toISOString(),
    };
}
```

Replace with:

```ts
function shellyToGraphQL(d: IShellyDevice) {
    return {
        id: String(d._id),
        deviceId: d.deviceId,
        name: d.name,
        mqttBrokerUrl: process.env.MQTT_PUBLIC_URL ?? 'mqtts://example.hivemq.cloud:8883',
        mqttUsername: process.env.MQTT_PUBLISHER_USERNAME ?? 'shelly-publisher',
        mqttPassword: process.env.MQTT_PUBLISHER_PASSWORD ?? '',
        mqttPrefix: `gw/${d.deviceId}`,
        lastSeenAt: d.lastSeenAt ? d.lastSeenAt.toISOString() : null,
        lastBatteryPercent: d.lastBatteryPercent ?? null,
        createdAt: d.createdAt.toISOString(),
    };
}
```

- [ ] **Step 3: Update `addShellyDevice` resolver**

Find:

```ts
addShellyDevice: async (_: any, args: { name: string }, ctx: Ctx) => {
    if (!ctx.user) throw new Error('Unauthorized');
    const name = args.name.trim().slice(0, 60);
    if (!name) throw new Error('Name is required');

    const existing = await ShellyDevice.findOne({ userId: ctx.user.userId });
    if (existing) throw new Error('You can only pair one Shelly device per account');

    const created = await ShellyDevice.create({
        userId: ctx.user.userId,
        deviceId: generateShellyDeviceId(),
        name,
        webhookToken: generateShellyToken(),
    });
    return shellyToGraphQL(created);
},
```

Replace with:

```ts
addShellyDevice: async (_: any, args: { name: string }, ctx: Ctx) => {
    if (!ctx.user) throw new Error('Unauthorized');
    const name = args.name.trim().slice(0, 60);
    if (!name) throw new Error('Name is required');

    const existing = await ShellyDevice.findOne({ userId: ctx.user.userId });
    if (existing) throw new Error('You can only pair one Shelly device per account');

    const created = await ShellyDevice.create({
        userId: ctx.user.userId,
        deviceId: generateShellyDeviceId(),
        name,
    });
    return shellyToGraphQL(created);
},
```

- [ ] **Step 4: Delete `rotateShellyToken` resolver**

Find this entire block and delete it:

```ts
rotateShellyToken: async (_: any, args: { id: string }, ctx: Ctx) => {
    if (!ctx.user) throw new Error('Unauthorized');
    const updated = await ShellyDevice.findOneAndUpdate(
        { _id: args.id, userId: ctx.user.userId },
        { $set: { webhookToken: generateShellyToken() } },
        { new: true }
    );
    if (!updated) throw new Error('Device not found');
    return shellyToGraphQL(updated);
},
```

- [ ] **Step 5: Clean up unused imports**

If the file imports `crypto` and uses it ONLY for the deleted `generateShellyToken`, leave it — `generateShellyDeviceId` also uses crypto. Verify by grepping the file for `crypto.` after the edits.

- [ ] **Step 6: Typecheck**

```
cd /c/Users/Sergii/Desktop/growwatch/backend && npx tsc --noEmit
```
Expected: still fails because `schema.ts` and `index.ts` reference removed names. Tasks 6 + 7 fix those.

---

## Task 6: GraphQL schema — drop `webhookUrl` and `rotateShellyToken`

**Files:**
- Modify: `backend/src/schema.ts`

- [ ] **Step 1: Update `ShellyDevice` type**

Find:

```graphql
type ShellyDevice {
  id: String!
  deviceId: String!
  name: String!
  webhookUrl: String!
  lastSeenAt: String
  lastBatteryPercent: Int
  createdAt: String!
}
```

Replace with:

```graphql
type ShellyDevice {
  id: String!
  deviceId: String!
  name: String!
  mqttBrokerUrl: String!
  mqttUsername: String!
  mqttPassword: String!
  mqttPrefix: String!
  lastSeenAt: String
  lastBatteryPercent: Int
  createdAt: String!
}
```

- [ ] **Step 2: Remove `rotateShellyToken` from `Mutation`**

In `type Mutation { ... }`, find and delete this single line:

```graphql
rotateShellyToken(id: String!): ShellyDevice!
```

- [ ] **Step 3: Typecheck**

```
cd /c/Users/Sergii/Desktop/growwatch/backend && npx tsc --noEmit
```
Expected: still failing in `index.ts`. Tasks 7 + 8 finish it.

---

## Task 7: MQTT consumer

**Files:**
- Create: `backend/src/mqttConsumer.ts`

- [ ] **Step 1: Write the consumer**

Create `backend/src/mqttConsumer.ts` with exactly:

```ts
import mqtt, { MqttClient } from 'mqtt';
import { ShellyDevice, IShellyDevice } from './models';
import { handleSensorData } from './resolvers';

const URL = process.env.MQTT_BROKER_URL ?? 'mqtts://example.hivemq.cloud:8883';
const PASSWORD = process.env.MQTT_SERVER_PASSWORD ?? '';

const TOPIC_TEMP = 'gw/+/status/temperature:0';
const TOPIC_HUM = 'gw/+/status/humidity:0';
const TOPIC_PWR = 'gw/+/status/devicepower:0';
const TOPIC_ONLINE = 'gw/+/online';

const DEBOUNCE_MS = 2000;
const DEVICE_CACHE_MS = 60_000;

interface DeviceBuffer {
    temperature?: number;
    humidity?: number;
    battery?: number | null;
    flushTimer?: NodeJS.Timeout;
}

const buffers = new Map<string, DeviceBuffer>();
const deviceCache = new Map<string, { device: IShellyDevice; cachedAt: number }>();

async function lookupDevice(deviceId: string): Promise<IShellyDevice | null> {
    const cached = deviceCache.get(deviceId);
    if (cached && Date.now() - cached.cachedAt < DEVICE_CACHE_MS) {
        return cached.device;
    }
    const fresh = await ShellyDevice.findOne({ deviceId });
    if (fresh) {
        deviceCache.set(deviceId, { device: fresh, cachedAt: Date.now() });
        return fresh;
    }
    return null;
}

function scheduleFlush(deviceId: string) {
    const buf = buffers.get(deviceId);
    if (!buf) return;
    if (buf.flushTimer) clearTimeout(buf.flushTimer);
    buf.flushTimer = setTimeout(() => flush(deviceId), DEBOUNCE_MS);
}

async function flush(deviceId: string) {
    const buf = buffers.get(deviceId);
    if (!buf) return;
    buffers.delete(deviceId);

    const device = await lookupDevice(deviceId);
    if (!device) {
        console.warn(`[mqtt] Dropped reading from unknown device ${deviceId}`);
        return;
    }

    const update: any = { lastSeenAt: new Date() };
    if (buf.battery != null) update.lastBatteryPercent = buf.battery;
    await ShellyDevice.updateOne({ _id: device._id }, { $set: update });

    if (buf.temperature !== undefined || buf.humidity !== undefined) {
        await handleSensorData({
            deviceId: device.deviceId,
            temperature: buf.temperature,
            humidity: buf.humidity,
            userId: device.userId,
        });
    }
}

function parseDeviceId(topic: string): string | null {
    const parts = topic.split('/');
    return parts[1] ?? null;
}

function getOrCreateBuffer(deviceId: string): DeviceBuffer {
    let buf = buffers.get(deviceId);
    if (!buf) { buf = {}; buffers.set(deviceId, buf); }
    return buf;
}

function onMessage(topic: string, payload: Buffer) {
    const deviceId = parseDeviceId(topic);
    if (!deviceId) return;

    let data: any;
    try { data = JSON.parse(payload.toString('utf8')); }
    catch { /* online topic is plain "true"/"false" */ }

    if (topic.endsWith('/status/temperature:0')) {
        if (data && typeof data.tC === 'number') {
            getOrCreateBuffer(deviceId).temperature = data.tC;
            scheduleFlush(deviceId);
        }
    } else if (topic.endsWith('/status/humidity:0')) {
        if (data && typeof data.rh === 'number') {
            getOrCreateBuffer(deviceId).humidity = data.rh;
            scheduleFlush(deviceId);
        }
    } else if (topic.endsWith('/status/devicepower:0')) {
        if (data && data.battery && typeof data.battery.percent === 'number') {
            getOrCreateBuffer(deviceId).battery = data.battery.percent;
            scheduleFlush(deviceId);
        }
    } else if (topic.endsWith('/online')) {
        const text = payload.toString('utf8');
        console.log(`[mqtt] device ${deviceId} online=${text}`);
    }
}

let client: MqttClient | null = null;

export function startMqttConsumer() {
    if (client) return;
    console.log(`[mqtt] connecting to ${URL} as gw-server`);
    client = mqtt.connect(URL, {
        username: 'gw-server',
        password: PASSWORD,
        reconnectPeriod: 5000,
    });
    client.on('connect', () => {
        console.log('[mqtt] connected');
        client!.subscribe([TOPIC_TEMP, TOPIC_HUM, TOPIC_PWR, TOPIC_ONLINE], err => {
            if (err) console.error('[mqtt] subscribe failed:', err);
            else console.log('[mqtt] subscribed to gw/+/status/+:0 and gw/+/online');
        });
    });
    client.on('reconnect', () => console.log('[mqtt] reconnecting…'));
    client.on('error', err => console.error('[mqtt] error:', err));
    client.on('message', (topic, payload) => onMessage(topic, payload));
}
```

- [ ] **Step 2: Typecheck**

```
cd /c/Users/Sergii/Desktop/growwatch/backend && npx tsc --noEmit
```
Expected: only `index.ts` errors remaining (the webhook references and missing consumer start). Task 8 fixes those.

---

## Task 8: index.ts — drop webhook route, start consumer

**Files:**
- Modify: `backend/src/index.ts`

- [ ] **Step 1: Update the resolver import**

Find:

```ts
import { handleSensorData, findShellyByToken, touchShelly } from './resolvers';
```

Replace with:

```ts
import { handleSensorData } from './resolvers';
```

- [ ] **Step 2: Delete the webhook route block**

Find the entire block beginning with:

```ts
// ─── Shelly H&T Gen3 webhook ──
app.post('/api/shelly/webhook', async (req, res) => {
```

…and ending with the matching closing `});`. Delete the whole block (about 30 lines).

- [ ] **Step 3: Import and start the consumer**

Add this import near the other `./` imports at the top of the file:

```ts
import { startMqttConsumer } from './mqttConsumer';
```

Find where the HTTP server starts listening (look for `httpServer.listen` or `app.listen`). Directly BEFORE that call, add:

```ts
startMqttConsumer();
```

- [ ] **Step 4: Final backend typecheck**

```
cd /c/Users/Sergii/Desktop/growwatch/backend && npx tsc --noEmit
```
Expected: no errors.

- [ ] **Step 5: Commit and push the entire backend cutover**

```
git add backend/src backend/package.json backend/package-lock.json backend/.env.example
git commit -m "shelly: replace webhook integration with MQTT (HiveMQ Cloud)"
git push origin master
```

- [ ] **Step 6: Wait for Railway to redeploy backend, then verify**

In Railway's backend logs, look for:
- `[mqtt] connecting to mqtts://… as gw-server`
- `[mqtt] connected`
- `[mqtt] subscribed to gw/+/status/+:0 and gw/+/online`

If you see "Connection refused" or auth errors, double-check the env vars from Task 2.

- [ ] **Step 7: External smoke test from your machine**

Install `mqttx` (npm: `npm i -g mqttx-cli`, or download from https://mqttx.app). Then publish a test reading using the `shelly-publisher` credential:

```
mqttx pub --hostname <your-cluster-host> --port 8883 \
  --username shelly-publisher --password "<shelly-publisher password>" \
  --topic 'gw/gw-test1234/status/temperature:0' \
  --message '{"id":0,"tC":21.5}' \
  --protocol mqtts
```

Expected: command succeeds. Railway logs should show:
- `[mqtt] Dropped reading from unknown device gw-test1234`

That confirms the backend received the message and looked it up in Mongo (just doesn't have that device yet — which is correct; you haven't created one).

---

## Task 9: Frontend service updates

**Files:**
- Modify: `frontend/src/app/core/services/shelly.service.ts`

- [ ] **Step 1: Update the `ShellyDevice` interface**

Find:

```ts
export interface ShellyDevice {
  id: string;
  deviceId: string;
  name: string;
  webhookUrl: string;
  lastSeenAt: string | null;
  lastBatteryPercent: number | null;
  createdAt: string;
}
```

Replace with:

```ts
export interface ShellyDevice {
  id: string;
  deviceId: string;
  name: string;
  mqttBrokerUrl: string;
  mqttUsername: string;
  mqttPassword: string;
  mqttPrefix: string;
  lastSeenAt: string | null;
  lastBatteryPercent: number | null;
  createdAt: string;
}
```

- [ ] **Step 2: Update the GraphQL fragment**

Find:

```ts
const SHELLY_FIELDS = `id deviceId name webhookUrl lastSeenAt lastBatteryPercent createdAt`;
```

Replace with:

```ts
const SHELLY_FIELDS = `id deviceId name mqttBrokerUrl mqttUsername mqttPassword mqttPrefix lastSeenAt lastBatteryPercent createdAt`;
```

- [ ] **Step 3: Delete the `rotateToken` method**

Find this entire method block (including the `gql` mutation) and delete it:

```ts
rotateToken(id: string): Observable<ShellyDevice> {
    return defer(() =>
      this.apolloClient.mutate<{ rotateShellyToken: ShellyDevice }>({
        mutation: gql`
          mutation RotateShellyToken($id: String!) {
            rotateShellyToken(id: $id) { ${SHELLY_FIELDS} }
          }
        `,
        variables: { id },
      }).then(result => result.data!.rotateShellyToken)
    );
  }
```

- [ ] **Step 4: Typecheck**

```
cd /c/Users/Sergii/Desktop/growwatch/frontend && npx tsc --noEmit
```
Expected: fails in `shelly-setup.component.ts` (references `rotate`) and `shelly-pairing-wizard.component.ts` (references `webhookUrl`). Tasks 10 + 11 fix.

---

## Task 10: Settings page — drop rotate button

**Files:**
- Modify: `frontend/src/app/features/settings/shelly-setup.component.ts`

- [ ] **Step 1: Remove the rotate button from the device card template**

Find this button block in the template:

```html
<button (click)="rotate(d)" [title]="t('shelly.rotateToken')"
        class="w-9 h-9 flex items-center justify-center rounded-lg text-gray-400 hover:bg-gw-amber-light hover:text-gw-amber transition-colors">
  <app-icon name="refresh" class="w-4 h-4" />
</button>
```

Delete it.

- [ ] **Step 2: Remove the `rotate` method from the class**

Find this method:

```ts
rotate(d: ShellyDevice) {
    if (!confirm(this.transloco.translate('shelly.rotateTokenConfirm'))) return;
    this.shelly.rotateToken(d.id).subscribe({
      next: () => this.reload(),
      error: err => alert(err?.message ?? 'Failed to rotate token'),
    });
  }
```

Delete the whole method.

- [ ] **Step 3: Typecheck**

```
cd /c/Users/Sergii/Desktop/growwatch/frontend && npx tsc --noEmit
```
Expected: only the wizard component still references `webhookUrl`. Task 11 fixes it.

---

## Task 11: Wizard step 4 — four copyable values + i18n

**Files:**
- Modify: `frontend/src/app/features/settings/shelly-pairing-wizard.component.ts`
- Modify: `frontend/public/i18n/en.json` and `da.json`

- [ ] **Step 1: Update English i18n**

In `frontend/public/i18n/en.json`, inside `shelly.wizard`, find:

```json
"step3Title": "Copy the URL, then join the Shelly's Wi-Fi",
"step3Body": "1. Tap Copy below — this puts the URL on your clipboard.\n2. Open your phone's Wi-Fi settings.\n3. Connect to the network named ShellyHTG3-… (no password).\n4. Come back here and tap Next.\n\nDon't worry: your clipboard is preserved when you switch Wi-Fi networks. You'll need the URL in the next step.",
```

Replace with:

```json
"step3Title": "Join the Shelly's Wi-Fi",
"step3Body": "1. Open your phone's Wi-Fi settings.\n2. Connect to the network named ShellyHTG3-… (no password).\n3. Come back here and tap Next.\n\nYou'll configure the Shelly's MQTT connection in the next step — we'll show you all the values to paste.",
```

Then find:

```json
"step4Body": "Your phone is now on the Shelly's hotspot — no internet, but you can reach the Shelly directly. Do everything below in a new browser tab:\n\n1. Go to http://192.168.33.1\n2. Settings → Wi-Fi → Wi-Fi 1 → enter your home Wi-Fi name and password → Save.\n3. Settings → Webhooks (may be called 'Outbound Webhooks' or 'URL Actions' on older firmware) → Add.\n4. Channel: Temperature · Event: On value change · Method: POST · URL: paste from clipboard · Save.\n5. Tap Add again. Same setup but Channel: Humidity. Save.\n6. Come back here and tap Next.",
"urlLabel": "Your webhook URL",
```

Replace with:

```json
"step4Body": "Your phone is on the Shelly's hotspot. In a new browser tab:\n\n1. Go to http://192.168.33.1\n2. Settings → Wi-Fi → Wi-Fi 1 → enter your home Wi-Fi name and password → Save.\n3. Settings → MQTT.\n4. Enable MQTT: on.\n5. Server: paste the broker URL below.\n6. Client ID: leave blank.\n7. MQTT user: paste the username below.\n8. MQTT password: paste the password below.\n9. Custom MQTT prefix: paste the prefix below.\n10. Generic status update over MQTT: on.\n11. RPC status notifications over MQTT: on.\n12. Save.\n13. Come back here and tap Next.",
"brokerUrlLabel": "Broker URL",
"usernameLabel": "Username",
"passwordLabel": "Password",
"prefixLabel": "Custom MQTT prefix",
```

Also find and delete these now-unused keys:

```json
"rotateToken": "Rotate token",
"rotateTokenConfirm": "Generate a new webhook URL? The old URL will stop working immediately.",
"webhookUrlLabel": "Webhook URL",
"webhookUrlHint": "Paste this URL into Shelly's Settings → Webhooks → Add → trigger on temperature OR humidity change",
```

- [ ] **Step 2: Update Danish i18n**

In `frontend/public/i18n/da.json`, apply the parallel changes. Find and replace:

```json
"step3Title": "Kopiér URL'en, og tilslut Shellyens Wi-Fi",
"step3Body": "1. Tryk Kopiér nedenfor — det lægger URL'en på dit udklipsholder.\n2. Åbn Wi-Fi-indstillinger på telefonen.\n3. Forbind til netværket ShellyHTG3-… (ingen adgangskode).\n4. Kom tilbage hertil og tryk Næste.\n\nBare rolig: dit udklipsholder bevares når du skifter Wi-Fi-netværk. URL'en bruges i næste skridt.",
```

With:

```json
"step3Title": "Tilslut Shellyens Wi-Fi",
"step3Body": "1. Åbn Wi-Fi-indstillinger på telefonen.\n2. Forbind til netværket ShellyHTG3-… (ingen adgangskode).\n3. Kom tilbage hertil og tryk Næste.\n\nDu konfigurerer Shellyens MQTT-forbindelse i næste skridt — vi viser dig alle værdier du skal indsætte.",
```

And:

```json
"step4Body": "Din telefon er nu på Shellyens hotspot — uden internet, men du kan tilgå Shellyen direkte. Gør alt nedenfor i en ny browserfane:\n\n1. Gå til http://192.168.33.1\n2. Settings → Wi-Fi → Wi-Fi 1 → indtast dit hjem-Wi-Fi-navn og adgangskode → Save.\n3. Settings → Webhooks (kan hedde 'Outbound Webhooks' eller 'URL Actions' på ældre firmware) → Add.\n4. Channel: Temperature · Event: On value change · Method: POST · URL: indsæt fra udklipsholder · Save.\n5. Tryk Add igen. Samme opsætning men Channel: Humidity. Save.\n6. Kom tilbage hertil og tryk Næste.",
"urlLabel": "Din webhook-URL",
```

With:

```json
"step4Body": "Din telefon er på Shellyens hotspot. I en ny browserfane:\n\n1. Gå til http://192.168.33.1\n2. Settings → Wi-Fi → Wi-Fi 1 → indtast dit hjem-Wi-Fi-navn og adgangskode → Save.\n3. Settings → MQTT.\n4. Enable MQTT: on.\n5. Server: indsæt broker-URL'en nedenfor.\n6. Client ID: lad være tom.\n7. MQTT user: indsæt brugernavnet nedenfor.\n8. MQTT password: indsæt adgangskoden nedenfor.\n9. Custom MQTT prefix: indsæt præfikset nedenfor.\n10. Generic status update over MQTT: on.\n11. RPC status notifications over MQTT: on.\n12. Save.\n13. Kom tilbage hertil og tryk Næste.",
"brokerUrlLabel": "Broker-URL",
"usernameLabel": "Brugernavn",
"passwordLabel": "Adgangskode",
"prefixLabel": "Custom MQTT prefix",
```

Also delete the parallel Danish keys for `rotateToken`, `rotateTokenConfirm`, `webhookUrlLabel`, `webhookUrlHint`.

- [ ] **Step 3: Strip the URL card out of step 3 in the wizard component**

In `frontend/src/app/features/settings/shelly-pairing-wizard.component.ts`, find the step 3 block:

```html
@case (3) {
  <div class="space-y-4">
    <div class="text-4xl">🔗</div>
    <h1 class="text-[20px] font-medium text-gray-800">{{ t('shelly.wizard.step3Title') }}</h1>
    @if (device(); as d) {
      <div class="bg-gw-surface shadow-gw-sm rounded-xl p-3">
        <div class="text-[11px] text-gray-400 mb-1.5">{{ t('shelly.wizard.urlLabel') }}</div>
        <div class="flex items-center gap-2">
          <code class="flex-1 text-[11px] bg-gray-50 rounded-lg px-2 py-1.5 truncate font-mono">{{ d.webhookUrl }}</code>
          <button (click)="copy()"
                  class="text-[12px] text-gw-green-dark hover:underline shrink-0 font-medium">
            {{ copied() ? t('shelly.copied') : t('shelly.copyUrl') }}
          </button>
        </div>
      </div>
    }
    <p class="text-[14px] text-gray-600 leading-relaxed whitespace-pre-line">{{ t('shelly.wizard.step3Body') }}</p>
  </div>
}
```

Replace with:

```html
@case (3) {
  <div class="space-y-4">
    <div class="text-4xl">📶</div>
    <h1 class="text-[20px] font-medium text-gray-800">{{ t('shelly.wizard.step3Title') }}</h1>
    <p class="text-[14px] text-gray-600 leading-relaxed whitespace-pre-line">{{ t('shelly.wizard.step3Body') }}</p>
  </div>
}
```

- [ ] **Step 4: Rewrite step 4 in the wizard component**

Find the step 4 block:

```html
@case (4) {
  <div class="space-y-4">
    <div class="text-4xl">⚙️</div>
    <h1 class="text-[20px] font-medium text-gray-800">{{ t('shelly.wizard.step4Title') }}</h1>
    @if (device(); as d) {
      <div class="bg-gw-surface shadow-gw-sm rounded-xl p-3">
        <div class="text-[11px] text-gray-400 mb-1.5">{{ t('shelly.wizard.urlLabel') }}</div>
        <div class="flex items-center gap-2">
          <code class="flex-1 text-[11px] bg-gray-50 rounded-lg px-2 py-1.5 truncate font-mono">{{ d.webhookUrl }}</code>
          <button (click)="copy()"
                  class="text-[12px] text-gw-green-dark hover:underline shrink-0 font-medium">
            {{ copied() ? t('shelly.copied') : t('shelly.copyUrl') }}
          </button>
        </div>
      </div>
    }
    <p class="text-[14px] text-gray-600 leading-relaxed whitespace-pre-line">{{ t('shelly.wizard.step4Body') }}</p>
  </div>
}
```

Replace with:

```html
@case (4) {
  <div class="space-y-4">
    <div class="text-4xl">⚙️</div>
    <h1 class="text-[20px] font-medium text-gray-800">{{ t('shelly.wizard.step4Title') }}</h1>
    @if (device(); as d) {
      <div class="space-y-2">
        <div class="bg-gw-surface shadow-gw-sm rounded-xl p-3">
          <div class="text-[11px] text-gray-400 mb-1.5">{{ t('shelly.wizard.brokerUrlLabel') }}</div>
          <div class="flex items-center gap-2">
            <code class="flex-1 text-[11px] bg-gray-50 rounded-lg px-2 py-1.5 truncate font-mono">{{ d.mqttBrokerUrl }}</code>
            <button (click)="copyValue(d.mqttBrokerUrl, 'broker')"
                    class="text-[12px] text-gw-green-dark hover:underline shrink-0 font-medium">
              {{ copiedField() === 'broker' ? t('shelly.copied') : t('shelly.copyUrl') }}
            </button>
          </div>
        </div>
        <div class="bg-gw-surface shadow-gw-sm rounded-xl p-3">
          <div class="text-[11px] text-gray-400 mb-1.5">{{ t('shelly.wizard.usernameLabel') }}</div>
          <div class="flex items-center gap-2">
            <code class="flex-1 text-[11px] bg-gray-50 rounded-lg px-2 py-1.5 truncate font-mono">{{ d.mqttUsername }}</code>
            <button (click)="copyValue(d.mqttUsername, 'user')"
                    class="text-[12px] text-gw-green-dark hover:underline shrink-0 font-medium">
              {{ copiedField() === 'user' ? t('shelly.copied') : t('shelly.copyUrl') }}
            </button>
          </div>
        </div>
        <div class="bg-gw-surface shadow-gw-sm rounded-xl p-3">
          <div class="text-[11px] text-gray-400 mb-1.5">{{ t('shelly.wizard.passwordLabel') }}</div>
          <div class="flex items-center gap-2">
            <code class="flex-1 text-[11px] bg-gray-50 rounded-lg px-2 py-1.5 truncate font-mono">{{ d.mqttPassword }}</code>
            <button (click)="copyValue(d.mqttPassword, 'pass')"
                    class="text-[12px] text-gw-green-dark hover:underline shrink-0 font-medium">
              {{ copiedField() === 'pass' ? t('shelly.copied') : t('shelly.copyUrl') }}
            </button>
          </div>
        </div>
        <div class="bg-gw-surface shadow-gw-sm rounded-xl p-3">
          <div class="text-[11px] text-gray-400 mb-1.5">{{ t('shelly.wizard.prefixLabel') }}</div>
          <div class="flex items-center gap-2">
            <code class="flex-1 text-[11px] bg-gray-50 rounded-lg px-2 py-1.5 truncate font-mono">{{ d.mqttPrefix }}</code>
            <button (click)="copyValue(d.mqttPrefix, 'prefix')"
                    class="text-[12px] text-gw-green-dark hover:underline shrink-0 font-medium">
              {{ copiedField() === 'prefix' ? t('shelly.copied') : t('shelly.copyUrl') }}
            </button>
          </div>
        </div>
      </div>
    }
    <p class="text-[14px] text-gray-600 leading-relaxed whitespace-pre-line">{{ t('shelly.wizard.step4Body') }}</p>
  </div>
}
```

- [ ] **Step 5: Swap `copied`/`copy` for `copiedField`/`copyValue`**

In the class body, find:

```ts
copied = signal(false);
```

Replace with:

```ts
copiedField = signal<string | null>(null);
```

Find:

```ts
copy() {
  const url = this.device()?.webhookUrl;
  if (!url) return;
  navigator.clipboard.writeText(url).then(() => {
    this.copied.set(true);
    setTimeout(() => this.copied.set(false), 1500);
  });
}
```

Replace with:

```ts
copyValue(value: string, field: string) {
  if (!value) return;
  navigator.clipboard.writeText(value).then(() => {
    this.copiedField.set(field);
    setTimeout(() => this.copiedField.set(null), 1500);
  });
}
```

- [ ] **Step 6: Typecheck**

```
cd /c/Users/Sergii/Desktop/growwatch/frontend && npx tsc --noEmit
```
Expected: no errors.

- [ ] **Step 7: Commit and push the frontend changes**

```
git add frontend/src frontend/public/i18n
git commit -m "shelly: wizard step 4 displays MQTT credentials instead of webhook URL"
git push origin master
```

- [ ] **Step 8: End-to-end manual verification**

After Vercel deploys:

1. Settings → Shelly H&T sensors → 🗑 the existing Greenhouse-Sensor device.
2. Tap Add Shelly → name `MQTT test` → reach step 4.
3. Verify four copy buttons appear: Broker URL, Username, Password, Prefix.
4. Confirm Broker URL starts with `mqtts://` and ends with `:8883`.
5. From your machine, simulate the Shelly publishing:

   ```
   mqttx pub --hostname <cluster-host> --port 8883 \
     --username shelly-publisher --password "<password>" \
     --topic '<copied-prefix>/status/temperature:0' \
     --message '{"id":0,"tC":21.5}' \
     --protocol mqtts
   mqttx pub --hostname <cluster-host> --port 8883 \
     --username shelly-publisher --password "<password>" \
     --topic '<copied-prefix>/status/humidity:0' \
     --message '{"id":0,"rh":48.2}' \
     --protocol mqtts
   ```

6. Within ~3 seconds the home page should show 21.5°C / 48.2% and the device card should flip to "Just now".

Once verified, do the real-device test: configure your physical Shelly's MQTT panel with the four values from step 4 and confirm readings flow through.

---

## Self-review notes

- **Spec coverage:**
  - HiveMQ Cloud Free Tier setup → Task 1.
  - Two static MQTT users (`gw-server`, `shelly-publisher`) with topic ACLs → Task 1 Step 2.
  - Railway env vars → Task 2.
  - `mqtt` npm dep → Task 3.
  - `ShellyDevice` model drops `webhookToken` → Task 4.
  - Resolver drops webhook helpers + `rotateShellyToken` → Task 5.
  - `shellyToGraphQL` returns MQTT fields from env → Task 5 Step 2.
  - GraphQL schema swap + mutation drop → Task 6.
  - MQTT consumer with 2s debounce + cache + handleSensorData bridge → Task 7.
  - Webhook route deletion + consumer start → Task 8.
  - Frontend service updates → Task 9.
  - Rotate button removal → Task 10.
  - Wizard step 3 + 4 i18n + template + class updates → Task 11.

- **Type consistency:** `mqttBrokerUrl`, `mqttUsername`, `mqttPassword`, `mqttPrefix` used identically across resolver mapping, GraphQL schema, frontend interface, GraphQL fragment, and wizard template. `copiedField` / `copyValue` rename consistent across class declaration, methods, and all four uses in the template.

- **No placeholders:** every step ships executable code or exact files + lines.

- **Risks acknowledged in spec are addressed in plan:**
  - Shared publisher credential is a real secret → Task 11 displays it in the wizard with the same shadow-card pattern as other secrets (no warning text needed; consistent with how the previous webhook URL was shown).
  - HiveMQ Cloud free tier policy → Task 1 documents the signup; switching brokers means rotating env vars from Task 2.
  - Shelly MQTT message schema verification → Task 8 Step 7 runs a smoke test that triggers the unknown-device log path; Task 11 Step 8 verifies the happy-path flow.
