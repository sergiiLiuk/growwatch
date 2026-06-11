# Shelly MQTT Integration Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace Shelly webhook integration with MQTT: deploy a Mosquitto broker on Railway with a sidecar that manages per-device auth, build a backend MQTT consumer that bridges to the existing `handleSensorData` pipeline, and rewrite the wizard's step 4 into a single MQTT-config form.

**Architecture:** A new Railway service `mqtt` runs `eclipse-mosquitto:2` with a tiny Node sidecar on internal port `9000` that rewrites `passwd`/`acl` files and signals mosquitto on `POST /reload-auth`. Backend connects to the broker as admin (`gw-server`), subscribes to `gw/+/status/+:0` and `gw/+/online`, debounces 2s per device, then flushes to `handleSensorData`. `ShellyDevice` swaps `webhookToken` for `mqttUsername`/`mqttPassword`. Wizard step 4 displays 4 copyable values (broker URL, username, password, prefix).

**Tech Stack:** TypeScript, Node.js, Express, MongoDB/Mongoose, Apollo Server, Angular 21 standalone components, Transloco i18n, Tailwind v4, `mqtt` npm package (backend client), `eclipse-mosquitto:2` (broker), Docker, Railway.

**Note on tests:** This project has no unit-test suite in this area. Verification follows the existing pattern: `npx tsc --noEmit` for both backend and frontend, plus manual verification using `mqttx` CLI for the broker and real-device testing for the wizard. Each task ends with a typecheck and (where applicable) a concrete manual-verify command.

**Note on `npm run build`:** Do NOT run `npm run build` in the frontend during these tasks. Its prebuild hook overwrites `frontend/src/environments/environment.prod.ts`. Use `npx tsc --noEmit` only.

**Task ordering and deploy strategy:** Tasks 1–2 add the broker infrastructure with zero impact on existing services. Tasks 3–7 must ship as a single backend deploy because they're a clean cut from webhook to MQTT. Tasks 8–9 then ship the frontend matching the new GraphQL shape. Don't ship frontend before backend.

---

## File map

### New files (created)

- `docker/mqtt/Dockerfile`
- `docker/mqtt/mosquitto.conf`
- `docker/mqtt/cert/cert.pem` and `docker/mqtt/cert/key.pem` (self-signed v1)
- `docker/mqtt/seed.sh`
- `docker/mqtt/sidecar/server.js`
- `docker/mqtt/sidecar/package.json`
- `backend/src/mqttAuth.ts`
- `backend/src/mqttConsumer.ts`

### Modified files

- `backend/src/models.ts` — `IShellyDevice` field swap
- `backend/src/schema.ts` — `ShellyDevice` GraphQL type
- `backend/src/resolvers.ts` — drop webhook helpers + rename rotate mutation + update shellyToGraphQL
- `backend/src/index.ts` — remove `/api/shelly/webhook` route, start MQTT consumer on boot
- `frontend/src/app/core/services/shelly.service.ts` — `ShellyDevice` interface + GraphQL fragment
- `frontend/src/app/features/settings/shelly-pairing-wizard.component.ts` — step 4 body (multi-row credentials) + `copy` helper to copy arbitrary string
- `frontend/public/i18n/en.json` and `frontend/public/i18n/da.json` — step 4 body keys

---

## Task 1: Mosquitto Docker image with sidecar

Build a self-contained Docker image with `eclipse-mosquitto:2` + a Node sidecar that manages auth.

**Files:**
- Create: `docker/mqtt/Dockerfile`
- Create: `docker/mqtt/mosquitto.conf`
- Create: `docker/mqtt/cert/cert.pem`, `docker/mqtt/cert/key.pem`
- Create: `docker/mqtt/seed.sh`
- Create: `docker/mqtt/sidecar/server.js`
- Create: `docker/mqtt/sidecar/package.json`

- [ ] **Step 1: Create the Mosquitto config**

Create `docker/mqtt/mosquitto.conf` with exactly:

```
persistence true
persistence_location /mosquitto/data/

log_dest stdout

listener 1883
allow_anonymous false
password_file /mosquitto/data/passwd
acl_file /mosquitto/data/acl

listener 8883
require_certificate false
cafile /mosquitto/cert/cert.pem
certfile /mosquitto/cert/cert.pem
keyfile /mosquitto/cert/key.pem
allow_anonymous false
password_file /mosquitto/data/passwd
acl_file /mosquitto/data/acl
```

- [ ] **Step 2: Generate self-signed cert**

Run on your local machine (one-time):

```
mkdir -p docker/mqtt/cert
openssl req -x509 -newkey rsa:2048 -nodes \
  -keyout docker/mqtt/cert/key.pem \
  -out docker/mqtt/cert/cert.pem \
  -days 3650 \
  -subj "/CN=mqtt.growwatch.dk"
```

This produces `key.pem` + `cert.pem`. Commit both — they're a public/private TLS pair scoped to this broker. (Lower-risk than usual TLS since you control both sides, but if you'd rather not commit the key, document it as a Railway secret and read it at boot in Step 4.)

- [ ] **Step 3: Create the seed script**

Create `docker/mqtt/seed.sh` with exactly:

```sh
#!/bin/sh
set -e

# Seed passwd + acl files if they don't already exist (first boot).
DATA=/mosquitto/data
if [ ! -f "$DATA/passwd" ]; then
  echo "[seed] First boot — seeding admin user gw-server"
  : > "$DATA/passwd"
  mosquitto_passwd -b "$DATA/passwd" gw-server "$MQTT_SERVER_PASSWORD"

  cat > "$DATA/acl" <<EOF
user gw-server
topic readwrite gw/#
EOF

  chmod 600 "$DATA/passwd" "$DATA/acl"
fi

echo "[seed] Done"
```

- [ ] **Step 4: Create the sidecar package.json**

Create `docker/mqtt/sidecar/package.json` with exactly:

```json
{
  "name": "gw-mqtt-sidecar",
  "version": "1.0.0",
  "private": true,
  "main": "server.js",
  "dependencies": {}
}
```

(No external deps — only Node built-ins.)

- [ ] **Step 5: Create the sidecar server**

Create `docker/mqtt/sidecar/server.js` with exactly:

```js
const http = require('http');
const fs = require('fs');
const { execSync } = require('child_process');

const PORT = 9000;
const SHARED_SECRET = process.env.SIDECAR_SECRET;
const DATA = '/mosquitto/data';
const PASSWD_PATH = `${DATA}/passwd`;
const ACL_PATH = `${DATA}/acl`;

if (!SHARED_SECRET) {
  console.error('[sidecar] SIDECAR_SECRET env var missing');
  process.exit(1);
}

function readJson(req) {
  return new Promise((resolve, reject) => {
    let body = '';
    req.on('data', chunk => { body += chunk; });
    req.on('end', () => {
      try { resolve(JSON.parse(body || '{}')); } catch (e) { reject(e); }
    });
    req.on('error', reject);
  });
}

/**
 * POST /reload-auth
 * Body: { devices: [{ username: string, plainPassword: string, deviceId: string }] }
 * Rewrites passwd (admin + every device) and acl (admin + per-device topic),
 * then sends SIGHUP to mosquitto.
 */
async function reloadAuth(req, res) {
  const body = await readJson(req);
  if (!Array.isArray(body.devices)) {
    res.writeHead(400);
    res.end('expected { devices: [] }');
    return;
  }

  // Rebuild passwd: keep admin, append each device.
  const adminPassword = process.env.MQTT_SERVER_PASSWORD;
  let tmpPasswd = '/tmp/passwd.new';
  fs.writeFileSync(tmpPasswd, '');
  execSync(`mosquitto_passwd -b ${tmpPasswd} gw-server "${adminPassword}"`);
  for (const d of body.devices) {
    execSync(`mosquitto_passwd -b ${tmpPasswd} ${d.username} "${d.plainPassword}"`);
  }
  fs.renameSync(tmpPasswd, PASSWD_PATH);

  // Rebuild acl: admin + per-device.
  const aclLines = ['user gw-server', 'topic readwrite gw/#', ''];
  for (const d of body.devices) {
    aclLines.push(`user ${d.username}`);
    aclLines.push(`topic readwrite gw/${d.deviceId}/#`);
    aclLines.push('');
  }
  fs.writeFileSync(ACL_PATH, aclLines.join('\n'));

  // SIGHUP mosquitto.
  execSync('pkill -HUP mosquitto');

  res.writeHead(204);
  res.end();
}

const server = http.createServer(async (req, res) => {
  if (req.headers['x-sidecar-secret'] !== SHARED_SECRET) {
    res.writeHead(401);
    res.end('unauthorized');
    return;
  }
  if (req.method === 'POST' && req.url === '/reload-auth') {
    try {
      await reloadAuth(req, res);
    } catch (e) {
      console.error('[sidecar] reload-auth failed:', e);
      res.writeHead(500);
      res.end(String(e));
    }
    return;
  }
  res.writeHead(404);
  res.end();
});

server.listen(PORT, '0.0.0.0', () => {
  console.log(`[sidecar] listening on :${PORT}`);
});
```

- [ ] **Step 6: Create the Dockerfile**

Create `docker/mqtt/Dockerfile` with exactly:

```dockerfile
FROM eclipse-mosquitto:2

# Install Node (Alpine package) for the sidecar.
RUN apk add --no-cache nodejs

# Copy config and cert.
COPY mosquitto.conf /mosquitto/config/mosquitto.conf
COPY cert/cert.pem /mosquitto/cert/cert.pem
COPY cert/key.pem /mosquitto/cert/key.pem
RUN chmod 600 /mosquitto/cert/key.pem

# Copy seed script and sidecar.
COPY seed.sh /usr/local/bin/seed.sh
RUN chmod +x /usr/local/bin/seed.sh

COPY sidecar /opt/sidecar

# Persistent data goes here (passwd, acl, mosquitto.db).
VOLUME /mosquitto/data

# Run seed, then both mosquitto and sidecar in parallel.
CMD ["sh", "-c", "/usr/local/bin/seed.sh && (node /opt/sidecar/server.js &) && exec mosquitto -c /mosquitto/config/mosquitto.conf"]

EXPOSE 1883 8883 9000
```

- [ ] **Step 7: Verify image builds locally**

```
cd docker/mqtt && docker build -t gw-mqtt .
```
Expected: build succeeds, final image `gw-mqtt` created. If you don't have Docker locally, you can skip this and rely on Railway's build in Task 2.

- [ ] **Step 8: Commit**

```
git add docker/mqtt
git commit -m "mqtt: add Mosquitto Docker image with auth sidecar"
```

---

## Task 2: Deploy MQTT service to Railway

Operator task — not code. Sets up the new Railway service that hosts the broker.

**Files:** None (Railway dashboard configuration).

- [ ] **Step 1: Create a new Railway service in the existing GrowWatch project**

In the Railway dashboard:
1. Open your GrowWatch project.
2. **+ New** → **Empty Service** → name it `mqtt`.
3. **Settings → Service → Connect Repo** → point at the same GitHub repo (`growwatch`) and set:
   - **Root Directory:** `docker/mqtt`
   - **Build:** Dockerfile (auto-detected)
4. **Settings → Networking** → **Generate Public Domain** for port `8883`. Use a custom domain `mqtt.growwatch.dk` (add a CNAME in your DNS to the generated Railway domain).
5. **Settings → Networking** → enable TCP proxy for port `8883` (Railway docs: "Custom TCP Proxy"). Internal port stays accessible via service-internal DNS as `mqtt.railway.internal:1883`.

- [ ] **Step 2: Add Railway env vars on the `mqtt` service**

Set these in Railway → `mqtt` service → Variables:

- `MQTT_SERVER_PASSWORD` = `<run: openssl rand -hex 32>` — record this value, you'll paste it into the backend service in Task 3.
- `SIDECAR_SECRET` = `<run: openssl rand -hex 32>` — record this value, you'll paste it into the backend service in Task 3.

- [ ] **Step 3: Add a persistent volume**

In Railway → `mqtt` service → **Settings → Volumes** → mount at `/mosquitto/data`. Size 1 GB.

- [ ] **Step 4: Deploy**

Trigger a deploy. Watch logs for:
- `[seed] First boot — seeding admin user gw-server`
- `[seed] Done`
- `[sidecar] listening on :9000`
- A Mosquitto startup banner mentioning `Opening ipv4 listen socket on port 1883` and `8883`.

- [ ] **Step 5: External smoke test**

From your local machine (install `mqttx` or use `mosquitto_pub`):

```
mqttx pub --hostname mqtt.growwatch.dk --port 8883 \
  --username gw-server --password "<MQTT_SERVER_PASSWORD>" \
  --topic 'gw/test' --message hello \
  --protocol mqtts --insecure
```

Expected: command exits 0. (`--insecure` because cert is self-signed.) If it fails: check Railway logs for the broker's accept errors.

- [ ] **Step 6: Record env vars for the backend service**

You now have:
- `MQTT_SERVER_PASSWORD` (set on mqtt service)
- `SIDECAR_SECRET` (set on mqtt service)
- Public host: `mqtt.growwatch.dk:8883`
- Internal host: `mqtt.railway.internal:1883`
- Sidecar internal host: `mqtt.railway.internal:9000`

These get added to the backend service in Task 3.

---

## Task 3: Backend env wiring + mqttAuth.ts helper

Add the helper that POSTs to the sidecar.

**Files:**
- Create: `backend/src/mqttAuth.ts`
- Modify: `backend/.env.example` (add new env vars)

- [ ] **Step 1: Set backend env vars on Railway (operator action)**

In Railway → `backend` service → Variables, add:

- `MQTT_SERVER_PASSWORD` = same value as on mqtt service
- `SIDECAR_SECRET` = same value as on mqtt service
- `MQTT_INTERNAL_URL` = `mqtt://mqtt.railway.internal:1883`
- `MQTT_SIDECAR_URL` = `http://mqtt.railway.internal:9000`
- `MQTT_PUBLIC_HOST` = `mqtt.growwatch.dk`
- `MQTT_PUBLIC_PORT` = `8883`

Trigger a redeploy (env-only changes need a manual restart). The new env vars are now available to the backend process.

- [ ] **Step 2: Add to .env.example**

If `backend/.env.example` exists, append (otherwise create with this content):

```
# MQTT broker (set by Railway in prod)
MQTT_INTERNAL_URL=mqtt://localhost:1883
MQTT_SIDECAR_URL=http://localhost:9000
MQTT_SERVER_PASSWORD=devpassword
SIDECAR_SECRET=devsecret
MQTT_PUBLIC_HOST=mqtt.growwatch.dk
MQTT_PUBLIC_PORT=8883
```

- [ ] **Step 3: Write `mqttAuth.ts`**

Create `backend/src/mqttAuth.ts` with exactly:

```ts
import { ShellyDevice } from './models';

const SIDECAR_URL = process.env.MQTT_SIDECAR_URL ?? 'http://localhost:9000';
const SIDECAR_SECRET = process.env.SIDECAR_SECRET ?? '';

/**
 * Reads all `ShellyDevice`s from Mongo and POSTs the full list to the sidecar,
 * which rewrites passwd/acl and SIGHUPs mosquitto. Call after any ShellyDevice
 * mutation that affects auth (add, remove, rotate).
 */
export async function syncMqttAuth(): Promise<void> {
    const devices = await ShellyDevice.find({}).select('deviceId mqttUsername mqttPassword');
    const body = JSON.stringify({
        devices: devices.map(d => ({
            username: d.mqttUsername,
            plainPassword: d.mqttPassword,
            deviceId: d.deviceId,
        })),
    });

    const res = await fetch(`${SIDECAR_URL}/reload-auth`, {
        method: 'POST',
        headers: {
            'content-type': 'application/json',
            'x-sidecar-secret': SIDECAR_SECRET,
        },
        body,
    });
    if (!res.ok) {
        const text = await res.text().catch(() => '');
        throw new Error(`Sidecar reload-auth failed: ${res.status} ${text}`);
    }
}
```

- [ ] **Step 4: Typecheck**

```
cd /c/Users/Sergii/Desktop/growwatch/backend && npx tsc --noEmit
```
Expected: fails with `IShellyDevice has no mqttUsername` (the model still has `webhookToken`). That's fine — Task 4 fixes it. Skip to Task 4 before committing this task; commit them together at the end.

(Skipping the early commit avoids leaving a non-compiling intermediate state.)

---

## Task 4: ShellyDevice model field swap

Drop `webhookToken`; add `mqttUsername` and `mqttPassword`.

**Files:**
- Modify: `backend/src/models.ts` — `IShellyDevice` interface + Mongoose schema

- [ ] **Step 1: Update the interface**

Find this block:

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

Replace `webhookToken` with the two new fields:

```ts
export interface IShellyDevice extends Document {
    userId: string;
    deviceId: string;
    name: string;
    mqttUsername: string;
    mqttPassword: string;
    lastSeenAt?: Date;
    lastBatteryPercent?: number;
    createdAt: Date;
}
```

- [ ] **Step 2: Update the schema**

Find this block:

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

Replace the `webhookToken` line with the two new fields:

```ts
const shellyDeviceSchema = new Schema<IShellyDevice>(
    {
        userId: { type: String, required: true, index: true },
        deviceId: { type: String, required: true },
        name: { type: String, required: true },
        mqttUsername: { type: String, required: true, unique: true, index: true },
        mqttPassword: { type: String, required: true },
        lastSeenAt: { type: Date },
        lastBatteryPercent: { type: Number, min: 0, max: 100 },
        createdAt: { type: Date, default: Date.now },
    },
    { collection: 'shelly_devices' }
);
```

(The `webhookToken` index is gone; `mqttUsername` takes the unique-indexed role.)

- [ ] **Step 3: Typecheck**

```
cd /c/Users/Sergii/Desktop/growwatch/backend && npx tsc --noEmit
```
Expected: fails with errors in `resolvers.ts` referencing `webhookToken`. Task 5 fixes it.

---

## Task 5: Resolvers — drop webhook helpers, update mutations

**Files:**
- Modify: `backend/src/resolvers.ts`

- [ ] **Step 1: Delete webhook helpers**

In `backend/src/resolvers.ts`, find and delete entirely:

- `const SHELLY_BACKEND_BASE = ...` constant
- `function buildShellyWebhookUrl(...) { ... }`
- `export async function findShellyByToken(...) { ... }`
- `export async function touchShelly(...) { ... }`

Keep `generateShellyToken` (it generates the 64-hex random — we'll reuse it for `mqttPassword` and rename it next). Also keep `generateShellyDeviceId`.

- [ ] **Step 2: Rename `generateShellyToken` to `generateMqttPassword`**

Find:

```ts
function generateShellyToken(): string {
    return crypto.randomBytes(32).toString('hex');
}
```

Rename to:

```ts
function generateMqttPassword(): string {
    return crypto.randomBytes(32).toString('hex');
}
```

Then find all references (`generateShellyToken()`) in this file and update them to `generateMqttPassword()`.

- [ ] **Step 3: Update `shellyToGraphQL`**

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
        mqttBrokerUrl: `mqtts://${process.env.MQTT_PUBLIC_HOST ?? 'mqtt.growwatch.dk'}:${process.env.MQTT_PUBLIC_PORT ?? '8883'}`,
        mqttUsername: d.mqttUsername,
        mqttPassword: d.mqttPassword,
        mqttPrefix: `gw/${d.deviceId}`,
        lastSeenAt: d.lastSeenAt ? d.lastSeenAt.toISOString() : null,
        lastBatteryPercent: d.lastBatteryPercent ?? null,
        createdAt: d.createdAt.toISOString(),
    };
}
```

- [ ] **Step 4: Update `addShellyDevice` resolver**

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

    const deviceId = generateShellyDeviceId();
    const created = await ShellyDevice.create({
        userId: ctx.user.userId,
        deviceId,
        name,
        mqttUsername: `gw-${deviceId}`,
        mqttPassword: generateMqttPassword(),
    });

    // Push updated auth to broker. If this throws, the device row is already
    // committed — the user can call rotateShellyMqttPassword to retry.
    try {
        await syncMqttAuth();
    } catch (e) {
        console.error('[shelly] syncMqttAuth after add failed:', e);
    }

    return shellyToGraphQL(created);
},
```

Add `import { syncMqttAuth } from './mqttAuth';` at the top of the file (next to the existing model imports).

- [ ] **Step 5: Rename `rotateShellyToken` → `rotateShellyMqttPassword`**

Find:

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

Replace with:

```ts
rotateShellyMqttPassword: async (_: any, args: { id: string }, ctx: Ctx) => {
    if (!ctx.user) throw new Error('Unauthorized');
    const updated = await ShellyDevice.findOneAndUpdate(
        { _id: args.id, userId: ctx.user.userId },
        { $set: { mqttPassword: generateMqttPassword() } },
        { new: true }
    );
    if (!updated) throw new Error('Device not found');

    try { await syncMqttAuth(); }
    catch (e) { console.error('[shelly] syncMqttAuth after rotate failed:', e); }

    return shellyToGraphQL(updated);
},
```

- [ ] **Step 6: Update `removeShellyDevice` to sync auth**

Find:

```ts
removeShellyDevice: async (_: any, args: { id: string }, ctx: Ctx) => {
    if (!ctx.user) throw new Error('Unauthorized');
    const result = await ShellyDevice.deleteOne({ _id: args.id, userId: ctx.user.userId });
    return result.deletedCount > 0;
},
```

Replace with:

```ts
removeShellyDevice: async (_: any, args: { id: string }, ctx: Ctx) => {
    if (!ctx.user) throw new Error('Unauthorized');
    const result = await ShellyDevice.deleteOne({ _id: args.id, userId: ctx.user.userId });
    if (result.deletedCount > 0) {
        try { await syncMqttAuth(); }
        catch (e) { console.error('[shelly] syncMqttAuth after remove failed:', e); }
    }
    return result.deletedCount > 0;
},
```

- [ ] **Step 7: Typecheck**

```
cd /c/Users/Sergii/Desktop/growwatch/backend && npx tsc --noEmit
```
Expected: still fails because `schema.ts` and `index.ts` reference removed names. Tasks 6 + 7 fix those.

---

## Task 6: GraphQL schema — swap `webhookUrl` for MQTT fields

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

- [ ] **Step 2: Rename `rotateShellyToken` mutation**

In `type Mutation { ... }`, find:

```graphql
rotateShellyToken(id: String!): ShellyDevice!
```

Replace with:

```graphql
rotateShellyMqttPassword(id: String!): ShellyDevice!
```

- [ ] **Step 3: Typecheck**

```
cd /c/Users/Sergii/Desktop/growwatch/backend && npx tsc --noEmit
```
Expected: still failing in `index.ts`. Task 7 + 8 finish it.

---

## Task 7: MQTT consumer

The new service file that subscribes and bridges to `handleSensorData`.

**Files:**
- Create: `backend/src/mqttConsumer.ts`
- Modify: `backend/package.json` — add the `mqtt` dependency

- [ ] **Step 1: Install the `mqtt` npm package**

```
cd /c/Users/Sergii/Desktop/growwatch/backend && npm install mqtt
```

- [ ] **Step 2: Write the consumer**

Create `backend/src/mqttConsumer.ts` with exactly:

```ts
import mqtt, { MqttClient } from 'mqtt';
import { ShellyDevice, IShellyDevice } from './models';
import { handleSensorData } from './resolvers';

const URL = process.env.MQTT_INTERNAL_URL ?? 'mqtt://localhost:1883';
const PASSWORD = process.env.MQTT_SERVER_PASSWORD ?? '';

const TOPIC_TEMP = 'gw/+/status/temperature:0';
const TOPIC_HUM = 'gw/+/status/humidity:0';
const TOPIC_PWR = 'gw/+/status/devicepower:0';
const TOPIC_ONLINE = 'gw/+/online';

const DEBOUNCE_MS = 2000;
const DEVICE_CACHE_MS = 60_000;

interface Buffer {
    temperature?: number;
    humidity?: number;
    battery?: number | null;
    flushTimer?: NodeJS.Timeout;
}

const buffers = new Map<string, Buffer>();
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

    // Update lastSeenAt + battery
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
    // gw/<deviceId>/status/temperature:0  →  <deviceId>
    const parts = topic.split('/');
    return parts[1] ?? null;
}

function getOrCreateBuffer(deviceId: string): Buffer {
    let buf = buffers.get(deviceId);
    if (!buf) { buf = {}; buffers.set(deviceId, buf); }
    return buf;
}

function onMessage(topic: string, payload: Buffer) {
    const deviceId = parseDeviceId(topic);
    if (!deviceId) return;

    let data: any;
    try { data = JSON.parse(payload.toString('utf8')); }
    catch { /* topics like .../online are plain strings — handle below */ }

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
    client.on('message', (topic: string, payload: any) => onMessage(topic, payload));
}
```

The mismatch between `Buffer` (local interface) and `Buffer` (Node's global Buffer type used in `onMessage`'s second param) is a deliberate type-shadowing. If TypeScript complains, rename the local interface to `DeviceBuffer` and update all references.

- [ ] **Step 3: Typecheck**

```
cd /c/Users/Sergii/Desktop/growwatch/backend && npx tsc --noEmit
```
Expected: probable rename needed for `Buffer` shadowing. Apply the rename if the error appears, then re-run.

---

## Task 8: index.ts — remove webhook route, start consumer

**Files:**
- Modify: `backend/src/index.ts`

- [ ] **Step 1: Remove webhook helper imports**

Find:

```ts
import { handleSensorData, findShellyByToken, touchShelly } from './resolvers';
```

Replace with:

```ts
import { handleSensorData } from './resolvers';
```

- [ ] **Step 2: Delete the webhook route**

Find the entire block beginning with:

```ts
// ─── Shelly H&T Gen3 webhook ──
app.post('/api/shelly/webhook', async (req, res) => {
```

…and ending with the matching closing `});`. Delete the whole block (~30 lines).

- [ ] **Step 3: Start the consumer on boot**

Add this import at the top of `index.ts` near the other `./` imports:

```ts
import { startMqttConsumer } from './mqttConsumer';
```

Find where the HTTP server starts listening (look for `httpServer.listen` or `app.listen`). Directly BEFORE that call, add:

```ts
startMqttConsumer();
```

So the order becomes: MongoDB connect → MQTT consumer connect → HTTP listen.

- [ ] **Step 4: Final typecheck**

```
cd /c/Users/Sergii/Desktop/growwatch/backend && npx tsc --noEmit
```
Expected: no errors.

- [ ] **Step 5: Commit the whole backend cutover**

```
git add backend/src backend/package.json backend/package-lock.json backend/.env.example
git commit -m "shelly: replace webhook integration with MQTT"
```

(This single commit ties Tasks 3–8 together because they only work as one atomic change.)

- [ ] **Step 6: Smoke test the new path locally (before deploying)**

You need the broker running locally to test. Quickest:

```
docker run --rm -p 1883:1883 -e MQTT_SERVER_PASSWORD=devpassword \
  -e SIDECAR_SECRET=devsecret \
  -v $PWD/docker/mqtt/sidecar:/opt/sidecar:ro \
  eclipse-mosquitto:2 \
  sh -c "echo 'allow_anonymous true' > /mosquitto/config/mosquitto.conf && mosquitto -c /mosquitto/config/mosquitto.conf"
```

(Anonymous mode for the quick local test — production uses the auth setup from Task 1.)

Then run the backend (`cd backend && npm run dev`) — boot log should include `[mqtt] connected` and `[mqtt] subscribed to …`.

Use `mqttx` to publish a test temperature message under a device ID matching one you create:
```
mqttx pub --hostname localhost --port 1883 --topic 'gw/gw-test123/status/temperature:0' --message '{"id":0,"tC":21.5}'
```

(In MongoDB you'll need a `ShellyDevice` with `deviceId: gw-test123`. Create one via the existing GraphQL `addShellyDevice` mutation after deploy.)

If the log shows `[mqtt] Dropped reading from unknown device gw-test123` — that's expected before you create the device. Otherwise expect to see the reading flow through `handleSensorData` after the 2-second debounce.

---

## Task 9: Frontend service updates

Swap webhook URL for the MQTT fields.

**Files:**
- Modify: `frontend/src/app/core/services/shelly.service.ts`

- [ ] **Step 1: Update the interface**

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

- [ ] **Step 3: Rename the rotate mutation**

Find:

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

Replace with:

```ts
rotateToken(id: string): Observable<ShellyDevice> {
    return defer(() =>
      this.apolloClient.mutate<{ rotateShellyMqttPassword: ShellyDevice }>({
        mutation: gql`
          mutation RotateShellyMqttPassword($id: String!) {
            rotateShellyMqttPassword(id: $id) { ${SHELLY_FIELDS} }
          }
        `,
        variables: { id },
      }).then(result => result.data!.rotateShellyMqttPassword)
    );
  }
```

(The method name `rotateToken` stays unchanged — only the underlying GraphQL operation renames.)

- [ ] **Step 4: Typecheck**

```
cd /c/Users/Sergii/Desktop/growwatch/frontend && npx tsc --noEmit
```
Expected: fails because the wizard component references `device.webhookUrl`. Task 10 fixes that.

---

## Task 10: Wizard step 4 — MQTT credentials display + i18n

**Files:**
- Modify: `frontend/src/app/features/settings/shelly-pairing-wizard.component.ts`
- Modify: `frontend/public/i18n/en.json` and `frontend/public/i18n/da.json`

- [ ] **Step 1: Update i18n keys (English)**

In `frontend/public/i18n/en.json`, inside `shelly.wizard`, find:

```json
"step4Body": "Your phone is now on the Shelly's hotspot — no internet, but you can reach the Shelly directly. Do everything below in a new browser tab:\n\n1. Go to http://192.168.33.1\n2. Settings → Wi-Fi → Wi-Fi 1 → enter your home Wi-Fi name and password → Save.\n3. Settings → Webhooks (may be called 'Outbound Webhooks' or 'URL Actions' on older firmware) → Add.\n4. Channel: Temperature · Event: On value change · Method: POST · URL: paste from clipboard · Save.\n5. Tap Add again. Same setup but Channel: Humidity. Save.\n6. Come back here and tap Next.",
"urlLabel": "Your webhook URL",
```

Replace those two keys with:

```json
"step4Body": "Your phone is now on the Shelly's hotspot — no internet, but you can reach the Shelly directly. Do everything below in a new browser tab:\n\n1. Go to http://192.168.33.1\n2. Settings → Wi-Fi → Wi-Fi 1 → enter your home Wi-Fi name and password → Save.\n3. Settings → MQTT.\n4. Enable MQTT: on.\n5. Server: paste the broker URL below.\n6. Client ID: leave blank.\n7. MQTT user: paste the username below.\n8. MQTT password: paste the password below.\n9. Custom MQTT prefix: paste the prefix below.\n10. Generic status update over MQTT: on.\n11. RPC status notifications over MQTT: on.\n12. Allow invalid TLS certificate: on.\n13. Save.\n14. Come back here and tap Next.",
"brokerUrlLabel": "Broker URL",
"usernameLabel": "Username",
"passwordLabel": "Password",
"prefixLabel": "Custom MQTT prefix",
```

(Delete the `urlLabel` key — replaced by the four new label keys above.)

Also update step 3 — instead of saying "Copy the URL", it should now say "Copy the broker URL". Find:

```json
"step3Title": "Copy the URL, then join the Shelly's Wi-Fi",
"step3Body": "1. Tap Copy below — this puts the URL on your clipboard.\n2. Open your phone's Wi-Fi settings.\n3. Connect to the network named ShellyHTG3-… (no password).\n4. Come back here and tap Next.\n\nDon't worry: your clipboard is preserved when you switch Wi-Fi networks. You'll need the URL in the next step.",
```

Replace with:

```json
"step3Title": "Join the Shelly's Wi-Fi",
"step3Body": "1. Open your phone's Wi-Fi settings.\n2. Connect to the network named ShellyHTG3-… (no password).\n3. Come back here and tap Next.\n\nYou'll set up the Shelly's MQTT connection in the next step — we'll show you all the values to paste.",
```

- [ ] **Step 2: Update i18n keys (Danish)**

In `frontend/public/i18n/da.json`, inside `shelly.wizard`, find:

```json
"step4Body": "Din telefon er nu på Shellyens hotspot — uden internet, men du kan tilgå Shellyen direkte. Gør alt nedenfor i en ny browserfane:\n\n1. Gå til http://192.168.33.1\n2. Settings → Wi-Fi → Wi-Fi 1 → indtast dit hjem-Wi-Fi-navn og adgangskode → Save.\n3. Settings → Webhooks (kan hedde 'Outbound Webhooks' eller 'URL Actions' på ældre firmware) → Add.\n4. Channel: Temperature · Event: On value change · Method: POST · URL: indsæt fra udklipsholder · Save.\n5. Tryk Add igen. Samme opsætning men Channel: Humidity. Save.\n6. Kom tilbage hertil og tryk Næste.",
"urlLabel": "Din webhook-URL",
```

Replace with:

```json
"step4Body": "Din telefon er nu på Shellyens hotspot — uden internet, men du kan tilgå Shellyen direkte. Gør alt nedenfor i en ny browserfane:\n\n1. Gå til http://192.168.33.1\n2. Settings → Wi-Fi → Wi-Fi 1 → indtast dit hjem-Wi-Fi-navn og adgangskode → Save.\n3. Settings → MQTT.\n4. Enable MQTT: on.\n5. Server: indsæt broker-URL'en nedenfor.\n6. Client ID: lad være tom.\n7. MQTT user: indsæt brugernavnet nedenfor.\n8. MQTT password: indsæt adgangskoden nedenfor.\n9. Custom MQTT prefix: indsæt præfikset nedenfor.\n10. Generic status update over MQTT: on.\n11. RPC status notifications over MQTT: on.\n12. Allow invalid TLS certificate: on.\n13. Save.\n14. Kom tilbage hertil og tryk Næste.",
"brokerUrlLabel": "Broker-URL",
"usernameLabel": "Brugernavn",
"passwordLabel": "Adgangskode",
"prefixLabel": "Custom MQTT prefix",
```

And update step 3:

```json
"step3Title": "Tilslut Shellyens Wi-Fi",
"step3Body": "1. Åbn Wi-Fi-indstillinger på telefonen.\n2. Forbind til netværket ShellyHTG3-… (ingen adgangskode).\n3. Kom tilbage hertil og tryk Næste.\n\nDu konfigurerer Shellyens MQTT-forbindelse i næste skridt — vi viser dig alle værdier du skal indsætte.",
```

- [ ] **Step 3: Update the wizard component's step 3 body**

In `frontend/src/app/features/settings/shelly-pairing-wizard.component.ts`, find:

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

Replace with (URL block dropped — step 3 is now just instructions):

```html
@case (3) {
  <div class="space-y-4">
    <div class="text-4xl">📶</div>
    <h1 class="text-[20px] font-medium text-gray-800">{{ t('shelly.wizard.step3Title') }}</h1>
    <p class="text-[14px] text-gray-600 leading-relaxed whitespace-pre-line">{{ t('shelly.wizard.step3Body') }}</p>
  </div>
}
```

- [ ] **Step 4: Update step 4 body to show 4 copyable values**

Find:

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

- [ ] **Step 5: Replace `copy()` + `copied` with multi-field versions**

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

- [ ] **Step 7: Commit**

```
git add frontend/src frontend/public/i18n
git commit -m "shelly: wizard step 4 displays MQTT credentials instead of webhook URL"
```

- [ ] **Step 8: End-to-end manual verification**

After deploying backend + frontend:

1. Settings → Shelly H&T sensors → remove any existing device.
2. Add Shelly → wizard → name "Test MQTT" → reach step 4.
3. Verify 4 separate copy buttons appear: Broker URL, Username, Password, Prefix.
4. Use `mqttx` from your machine to simulate the Shelly:

   ```
   mqttx pub --hostname mqtt.growwatch.dk --port 8883 \
     --username <copied-username> --password <copied-password> \
     --topic '<copied-prefix>/status/temperature:0' \
     --message '{"id":0,"tC":21.5}' \
     --protocol mqtts --insecure
   ```
   Then:
   ```
   mqttx pub --hostname mqtt.growwatch.dk --port 8883 \
     --username <copied-username> --password <copied-password> \
     --topic '<copied-prefix>/status/humidity:0' \
     --message '{"id":0,"rh":48.2}' \
     --protocol mqtts --insecure
   ```

5. Within ~3 seconds the home page should show 21.5°C / 48.2% and Settings → Shelly H&T sensors card should flip to "Just now".

---

## Self-review notes

- **Spec coverage:**
  - New Mosquitto Railway service with sidecar → Tasks 1–2.
  - Auth file management via sidecar HTTP → Tasks 1 (sidecar code) + Task 3 (backend caller).
  - Topic structure `gw/<deviceId>/status/+:0` → Tasks 1 (broker ACL) + Task 7 (consumer subscription).
  - Backend MQTT consumer with 2s debounce + lookupDevice cache + handleSensorData bridge → Task 7.
  - `ShellyDevice` field swap (webhookToken → mqttUsername + mqttPassword) → Task 4.
  - GraphQL `webhookUrl` → 4 MQTT fields + rename `rotateShellyToken` → Tasks 5 + 6.
  - Webhook route deletion → Task 8 Step 2.
  - Consumer starts on boot → Task 8 Step 3.
  - Wizard step 4 redesign with 4 copyable values → Task 10.
  - i18n updates en + da → Task 10.
  - Auth sync on add/remove/rotate → Task 5 Steps 4, 5, 6.
  - Self-signed TLS cert with "Allow invalid TLS certificate" flag instruction → Task 1 (cert) + Task 10 i18n (step 4 line 12).
  - Operator deletes old production device → spec migration section; explicit step in Task 10 verification ("remove any existing device").

- **Type consistency:** `mqttUsername`, `mqttPassword`, `mqttBrokerUrl`, `mqttPrefix` used identically across `IShellyDevice` model, GraphQL schema, resolver mapping, frontend interface, and template. `rotateShellyMqttPassword` mutation name matches between schema and resolver. `gw-<deviceId>` username format consistent across resolver (Task 5 Step 4), ACL writer (Task 1 sidecar), and consumer ACL match (Task 7 has admin only, devices auth via their own creds).

- **No placeholders:** every step ships executable code or exact files + lines.

- **Risks acknowledged in spec are addressed in plan:**
  - Railway TCP proxy on 8883 → Task 2 Step 1.4 explicit; fallback documented.
  - Self-signed cert → Task 1 Step 2 (generate); wizard tells user to enable "Allow invalid TLS certificate" (Task 10 i18n step 4 line 12).
  - Sidecar via internal HTTP → Tasks 1 + 3 implement this exactly.
  - Shelly MQTT schema verification → Task 7 logs raw payloads via the normal handler; if a parse fails, `data` is undefined and the message is skipped, but the topic-prefix detection still runs. Add raw-payload logging when debugging real devices if needed.
