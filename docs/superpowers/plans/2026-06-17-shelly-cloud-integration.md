# Shelly Cloud Integration (replacing MQTT) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the direct-MQTT Shelly integration with Shelly Cloud: the user links their Shelly account once with a cloud auth key, and a 5-minute backend poller pulls H&T readings from Shelly Cloud into the existing `handleSensorData` pipeline.

**Architecture:** Backend gains a `shellyCloud.ts` client (auth-key calls to the Shelly Cloud v2 API), a `shellyCloudPoller.ts` (5-min interval → `handleSensorData`), a new encrypted-at-rest `ShellyAccount` model, and reworked GraphQL (connect/link/disconnect). The direct-MQTT consumer, the `mqtt` dependency, the HiveMQ env vars, and the 9-step copy-paste wizard are removed. Everything downstream of `handleSensorData` (in-memory store, hourly aggregates, subscriptions, dashboard) is unchanged.

**Tech Stack:** TypeScript, Node 18+ (global `fetch`, `node:crypto`), Express, Mongoose, Apollo Server; Angular 21 standalone components, Transloco i18n, Tailwind v4.

**Spec:** `docs/superpowers/specs/2026-06-17-shelly-cloud-integration-design.md`

**Note on tests:** The backend has **no test runner** (no `test` script, no vitest/jest) — the project verifies with `npx tsc --noEmit` + manual checks. This plan keeps that convention. Pure functions (`encryptSecret`/`decryptSecret`, `mapStatus`, `pickNewReadings`) are verified with throwaway `npx ts-node -e "…"` assertion snippets (ts-node already backs `npm run dev`). No framework is added. Frontend uses `npx tsc -p tsconfig.app.json --noEmit` (strict templates) + JSON validation; **do not** run `npm run build` (its prebuild hook overwrites `environment.prod.ts`).

**External-API uncertainty:** The exact Shelly Cloud endpoints/JSON shapes are confirmed against a live account in **Task 1** before any client code is built. Tasks 4's code is written to the expected shapes (mirroring the old MQTT parser: `temperature:0.tC`, `humidity:0.rh`, `devicepower:0.battery.percent`) and adjusted to Task 1's findings if they differ. All shape uncertainty is localized to `mapStatus` and the two endpoint URLs.

**Branch:** Commit to `master` (project convention this whole effort). End every commit body with `Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>`.

---

## File map

### New files
- `backend/src/crypto.ts` — `encryptSecret`/`decryptSecret` (AES-256-GCM, `SHELLY_ENC_KEY`)
- `backend/src/shellyCloud.ts` — Shelly Cloud API client + `mapStatus` + `ShellyAuthError`
- `backend/src/shellyCloudPoller.ts` — 5-min poller + `pickNewReadings`
- `frontend/src/app/features/settings/shelly-connect.component.ts` — replaces the pairing wizard

### Modified files
- `backend/src/models.ts` — add `ShellyAccount`; add `lastReportedAt` to `ShellyDevice`
- `backend/src/resolvers.ts` — connect/link/disconnect resolvers, `shellyAccount` query, rework `shellyToGraphQL`/`myShellyDevices`, drop `addShellyDevice` + MQTT env
- `backend/src/schema.ts` — new types/mutations/query; drop MQTT fields + `addShellyDevice`
- `backend/src/index.ts` — drop `startMqttConsumer`, add `startShellyCloudPoller`
- `backend/.env.example` — drop `MQTT_*`, add `SHELLY_ENC_KEY`
- `backend/package.json` + lockfile — remove `mqtt`
- `frontend/src/app/core/services/shelly.service.ts` — interface + new operations
- `frontend/src/app/features/settings/shelly-setup.component.ts` — connect entry / disconnect / reconnect prompt
- `frontend/src/app/features/settings/settings.component.ts` — swap wizard usage if it references the old component
- `frontend/public/i18n/en.json` + `da.json` — connect-flow copy; remove wizard keys

### Deleted files
- `backend/src/mqttConsumer.ts`
- `frontend/src/app/features/settings/shelly-pairing-wizard.component.ts`

---

## Task 1: Confirm Shelly Cloud API shapes against a live account (operator, no code)

**Files:** None (produces notes used by Task 4).

- [ ] **Step 1: Get the auth key + server host**

In the Shelly Smart Control app: *User Settings → Authorization cloud key* → create/copy the **auth key** and note the **server host** (e.g. `shelly-XX-eu.shelly.cloud`).

- [ ] **Step 2: Confirm the device-list call**

From a machine with `curl`, try the v2 list/get and the legacy all-status, and record which works and its JSON:

```
curl -s "https://<HOST>/device/all_status?auth_key=<KEY>" | head -c 2000
```
Record: the path to each device's id, name/`name`, online flag, and the H&T fields (temperature, humidity, battery). Note whether the endpoint returns **all** devices (usable for discovery) and the exact field paths.

- [ ] **Step 3: Confirm the v2 status call**

```
curl -s -X POST "https://<HOST>/v2/devices/api/get?auth_key=<KEY>" \
  -H 'Content-Type: application/json' \
  -d '{"ids":["<DEVICE_ID>"],"select":["status"]}' | head -c 2000
```
Record the field paths for temperature (`tC`), humidity (`rh`), battery percent, and the per-device **last-update timestamp** (name + unit: epoch seconds vs ISO).

- [ ] **Step 4: Write the findings into the plan's Task 4 expectations**

In this file, under Task 4, append a short "Confirmed shapes" note with the real field paths and the list endpoint, so Task 4's `mapStatus`/endpoints match reality. If they match the assumed shapes (`temperature:0.tC`, `humidity:0.rh`, `devicepower:0.battery.percent`, timestamp), just note "matches assumptions."

---

## Task 2: Encryption helper

**Files:**
- Create: `backend/src/crypto.ts`

- [ ] **Step 1: Write the helper**

Create `backend/src/crypto.ts`:

```ts
import { createCipheriv, createDecipheriv, randomBytes, createHash } from 'crypto';

// 32-byte key derived from SHELLY_ENC_KEY (any-length secret hashed to 32 bytes).
function key(): Buffer {
    const secret = process.env.SHELLY_ENC_KEY;
    if (!secret) throw new Error('SHELLY_ENC_KEY is not set');
    return createHash('sha256').update(secret).digest();
}

// Returns "ivHex:tagHex:cipherHex"
export function encryptSecret(plain: string): string {
    const iv = randomBytes(12);
    const cipher = createCipheriv('aes-256-gcm', key(), iv);
    const enc = Buffer.concat([cipher.update(plain, 'utf8'), cipher.final()]);
    const tag = cipher.getAuthTag();
    return `${iv.toString('hex')}:${tag.toString('hex')}:${enc.toString('hex')}`;
}

export function decryptSecret(stored: string): string {
    const [ivHex, tagHex, dataHex] = stored.split(':');
    if (!ivHex || !tagHex || !dataHex) throw new Error('Malformed encrypted value');
    const decipher = createDecipheriv('aes-256-gcm', key(), Buffer.from(ivHex, 'hex'));
    decipher.setAuthTag(Buffer.from(tagHex, 'hex'));
    return Buffer.concat([decipher.update(Buffer.from(dataHex, 'hex')), decipher.final()]).toString('utf8');
}
```

- [ ] **Step 2: Verify the round-trip**

Run:
```
cd backend && SHELLY_ENC_KEY=test-key npx ts-node -e "import {encryptSecret,decryptSecret} from './src/crypto'; const s='abc123-secret'; const e=encryptSecret(s); if(decryptSecret(e)!==s) throw new Error('roundtrip failed'); if(e===s) throw new Error('not encrypted'); console.log('crypto ok');"
```
Expected: `crypto ok`

- [ ] **Step 3: Commit**

```
git add backend/src/crypto.ts
git commit -m "shelly: add AES-256-GCM secret helper for cloud auth keys"
```

---

## Task 3: Data model — `ShellyAccount` + `ShellyDevice.lastReportedAt`

**Files:**
- Modify: `backend/src/models.ts`

- [ ] **Step 1: Add `lastReportedAt` to the `ShellyDevice` interface + schema**

In `backend/src/models.ts`, find:

```ts
export interface IShellyDevice extends Document {
    userId: string;
    deviceId: string;          // Shelly serial, e.g. "shellyhtg3-AABBCCDDEEFF"
    name: string;
    lastSeenAt?: Date;
    lastBatteryPercent?: number;
    createdAt: Date;
}
```
Add `lastReportedAt?: Date;` after `lastSeenAt?: Date;`. Then in `shellyDeviceSchema`, add `lastReportedAt: { type: Date },` after the `lastSeenAt` line.

- [ ] **Step 2: Add the `ShellyAccount` model**

Immediately after the `ShellyDevice` model export (after the line `mongoose.models.ShellyDevice || mongoose.model<IShellyDevice>('ShellyDevice', shellyDeviceSchema);`), add:

```ts
// ── Shelly Cloud account (one per user) ──────────────────────────────────────
export type ShellyAccountStatus = 'ok' | 'auth_error';

export interface IShellyAccount extends Document {
    userId: string;
    authKeyEnc: string;     // encrypted with crypto.ts; never returned via GraphQL
    serverHost: string;     // e.g. "shelly-XX-eu.shelly.cloud"
    status: ShellyAccountStatus;
    createdAt: Date;
}

const shellyAccountSchema = new Schema<IShellyAccount>(
    {
        userId: { type: String, required: true, unique: true, index: true },
        authKeyEnc: { type: String, required: true },
        serverHost: { type: String, required: true },
        status: { type: String, enum: ['ok', 'auth_error'], default: 'ok' },
        createdAt: { type: Date, default: Date.now },
    },
    { collection: 'shelly_accounts' }
);

export const ShellyAccount: Model<IShellyAccount> =
    mongoose.models.ShellyAccount || mongoose.model<IShellyAccount>('ShellyAccount', shellyAccountSchema);
```

- [ ] **Step 3: Typecheck**

Run: `cd backend && npx tsc --noEmit`
Expected: no errors (the model compiles on its own).

- [ ] **Step 4: Commit**

```
git add backend/src/models.ts
git commit -m "shelly: add ShellyAccount model and lastReportedAt field"
```

---

## Task 4: Shelly Cloud client

**Files:**
- Create: `backend/src/shellyCloud.ts`

> **Partial confirmation (from official docs, 2026-06-17 — not a live account):**
> - The v2 `POST /v2/devices/api/get` response is an **array** of device states, each `{ id, type, code, gen, online: 0|1, status: {...}, settings: {...} }`. `getDevicesStatus`/`mapStatus` already parse this envelope (array → per-device `id` + `status`). ✅
> - **Still UNCONFIRMED (require a live H&T account — Task 1 Steps 2–3):**
>   1. The H&T status field paths. Assumed `status['temperature:0'].tC`, `status['humidity:0'].rh`, `status['devicepower:0'].battery.percent` (mirrors the Shelly local/MQTT status the old consumer parsed). Docs only show a relay example.
>   2. The last-update **timestamp** field + unit. Assumed numeric `_updated` (epoch seconds). This drives dedup — if wrong, readings won't ingest.
>   3. The **device-list** endpoint for discovery. `listDevices` uses the deprecated `/device/all_status`; the docs don't document a v2 "list all" call. Confirm this returns the account's devices with id/name/online.
> Adjust `mapStatus` field reads and the two endpoint URLs in `shellyCloud.ts` to match Task 1's live findings.

- [ ] **Step 1: Write the client**

Create `backend/src/shellyCloud.ts`:

```ts
export interface ShellyCloudDevice {
    id: string;
    name: string;
    online: boolean;
}

export interface ShellyCloudStatus {
    id: string;
    temperature?: number;
    humidity?: number;
    batteryPercent?: number;
    reportedAt: Date | null;
}

export class ShellyAuthError extends Error {
    constructor() { super('Shelly Cloud rejected the auth key'); this.name = 'ShellyAuthError'; }
}

function baseUrl(host: string): string {
    const h = host.replace(/^https?:\/\//, '').replace(/\/+$/, '');
    return `https://${h}`;
}

// Pure: map one device's raw v2 status object → our shape. Exported for verification.
export function mapStatus(id: string, raw: any): ShellyCloudStatus {
    const status = raw?.status ?? raw ?? {};
    const tC = status['temperature:0']?.tC;
    const rh = status['humidity:0']?.rh;
    const battery = status['devicepower:0']?.battery?.percent;
    const updated = status['_updated'] ?? raw?.['_updated'];
    let reportedAt: Date | null = null;
    if (typeof updated === 'number') reportedAt = new Date(updated * 1000);
    else if (typeof updated === 'string') { const d = new Date(updated); reportedAt = isNaN(d.getTime()) ? null : d; }
    return {
        id,
        temperature: typeof tC === 'number' ? tC : undefined,
        humidity: typeof rh === 'number' ? rh : undefined,
        batteryPercent: typeof battery === 'number' ? battery : undefined,
        reportedAt,
    };
}

// Discovery: list all devices on the account (used at connect time).
export async function listDevices(host: string, authKey: string): Promise<ShellyCloudDevice[]> {
    const res = await fetch(`${baseUrl(host)}/device/all_status?auth_key=${encodeURIComponent(authKey)}`);
    if (res.status === 401) throw new ShellyAuthError();
    if (!res.ok) throw new Error(`Shelly Cloud list failed: ${res.status}`);
    const json: any = await res.json();
    const devices = json?.data?.devices_status ?? {};
    return Object.keys(devices).map(id => ({
        id,
        name: devices[id]?.name ?? id,
        online: devices[id]?.cloud?.connected ?? devices[id]?.online ?? false,
    }));
}

// Polling: fetch status for up to 10 device ids via the supported v2 endpoint.
export async function getDevicesStatus(host: string, authKey: string, ids: string[]): Promise<ShellyCloudStatus[]> {
    if (ids.length === 0) return [];
    const res = await fetch(`${baseUrl(host)}/v2/devices/api/get?auth_key=${encodeURIComponent(authKey)}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ids: ids.slice(0, 10), select: ['status'] }),
    });
    if (res.status === 401) throw new ShellyAuthError();
    if (!res.ok) throw new Error(`Shelly Cloud status failed: ${res.status}`);
    const json: any = await res.json();
    const arr: any[] = Array.isArray(json) ? json : (json?.devices ?? json?.data ?? []);
    return arr.map(d => mapStatus(d?.id ?? d?.device_id, d));
}
```

- [ ] **Step 2: Verify `mapStatus` (pure)**

Run:
```
cd backend && npx ts-node -e "import {mapStatus} from './src/shellyCloud'; const r=mapStatus('x',{status:{'temperature:0':{tC:21.5},'humidity:0':{rh:48},'devicepower:0':{battery:{percent:87}},_updated:1700000000}}); if(r.temperature!==21.5||r.humidity!==48||r.batteryPercent!==87||!(r.reportedAt instanceof Date)) throw new Error('map failed '+JSON.stringify(r)); const e=mapStatus('y',{status:{}}); if(e.temperature!==undefined||e.reportedAt!==null) throw new Error('empty map failed'); console.log('mapStatus ok');"
```
Expected: `mapStatus ok`

- [ ] **Step 3: Typecheck**

Run: `cd backend && npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 4: Commit**

```
git add backend/src/shellyCloud.ts
git commit -m "shelly: add Shelly Cloud API client"
```

---

## Task 5: Cloud poller

**Files:**
- Create: `backend/src/shellyCloudPoller.ts`

- [ ] **Step 1: Write the poller**

Create `backend/src/shellyCloudPoller.ts`:

```ts
import { ShellyAccount, ShellyDevice, IShellyDevice } from './models';
import { decryptSecret } from './crypto';
import { listDevices, getDevicesStatus, mapStatus, ShellyCloudStatus, ShellyCloudDevice, ShellyAuthError } from './shellyCloud';
import { handleSensorData } from './resolvers';

export { listDevices, getDevicesStatus, ShellyCloudDevice, ShellyAuthError };

const POLL_MS = 5 * 60 * 1000;

// Pure: which statuses are newer than what we last ingested for each device.
export function pickNewReadings(
    statuses: ShellyCloudStatus[],
    devices: Pick<IShellyDevice, 'deviceId' | 'lastReportedAt'>[],
): ShellyCloudStatus[] {
    const lastById = new Map(devices.map(d => [d.deviceId, d.lastReportedAt ?? null]));
    return statuses.filter(s => {
        if (!lastById.has(s.id)) return false;
        if (!s.reportedAt) return false;
        const last = lastById.get(s.id)!;
        return !last || s.reportedAt.getTime() > last.getTime();
    });
}

async function pollAccount(userId: string, host: string, authKey: string): Promise<void> {
    const devices = await ShellyDevice.find({ userId });
    if (devices.length === 0) return;
    const statuses = await getDevicesStatus(host, authKey, devices.map(d => d.deviceId));
    const fresh = pickNewReadings(statuses, devices);
    for (const s of fresh) {
        await handleSensorData({ deviceId: s.id, temperature: s.temperature, humidity: s.humidity, userId });
        await ShellyDevice.updateOne(
            { userId, deviceId: s.id },
            { $set: { lastSeenAt: new Date(), lastReportedAt: s.reportedAt, ...(s.batteryPercent != null ? { lastBatteryPercent: s.batteryPercent } : {}) } },
        );
    }
}

async function tick(): Promise<void> {
    const accounts = await ShellyAccount.find({ status: 'ok' });
    for (const acc of accounts) {
        try {
            await pollAccount(acc.userId, acc.serverHost, decryptSecret(acc.authKeyEnc));
        } catch (err) {
            if (err instanceof ShellyAuthError) {
                await ShellyAccount.updateOne({ _id: acc._id }, { $set: { status: 'auth_error' } });
                console.warn(`[shelly-cloud] auth error for user ${acc.userId}; marked auth_error`);
            } else {
                console.error('[shelly-cloud] poll error:', err);
            }
        }
    }
}

let timer: NodeJS.Timeout | null = null;
export function startShellyCloudPoller() {
    if (timer) return;
    console.log('[shelly-cloud] poller started (every 5 min)');
    tick().catch(e => console.error('[shelly-cloud] initial tick failed:', e));
    timer = setInterval(() => { tick().catch(e => console.error('[shelly-cloud] tick failed:', e)); }, POLL_MS);
}
```

- [ ] **Step 2: Verify `pickNewReadings` (pure)**

Run:
```
cd backend && npx ts-node -e "import {pickNewReadings} from './src/shellyCloudPoller'; const now=new Date(); const old=new Date(now.getTime()-3600000); const out=pickNewReadings([{id:'a',reportedAt:now} as any,{id:'b',reportedAt:old} as any,{id:'c',reportedAt:now} as any],[{deviceId:'a',lastReportedAt:old},{deviceId:'b',lastReportedAt:old},{deviceId:'z',lastReportedAt:null} as any]); const ids=out.map(o=>o.id).sort().join(','); if(ids!=='a') throw new Error('dedup wrong: '+ids); console.log('pickNewReadings ok');"
```
Expected: `pickNewReadings ok` (only `a` is newer; `b` is equal/old, `c` has no matching device, `z` has no status).

- [ ] **Step 3: Typecheck**

Run: `cd backend && npx tsc --noEmit`
Expected: no errors (imports `handleSensorData` from resolvers — already exported).

- [ ] **Step 4: Commit**

```
git add backend/src/shellyCloudPoller.ts
git commit -m "shelly: add Shelly Cloud poller with dedup"
```

---

## Task 6: GraphQL schema + resolvers

**Files:**
- Modify: `backend/src/schema.ts`, `backend/src/resolvers.ts`

- [ ] **Step 1: Update the schema**

In `backend/src/schema.ts`, replace the `ShellyDevice` type (the block with `mqttBrokerUrl`…`mqttPrefix`) with:

```graphql
  type ShellyDevice {
    id: String!
    deviceId: String!
    name: String!
    lastSeenAt: String
    lastBatteryPercent: Int
    createdAt: String!
  }

  type ShellyAccountInfo {
    connected: Boolean!
    status: String!
  }

  type ShellyCloudDevice {
    id: String!
    name: String!
    online: Boolean!
  }
```

In the `Query` block, after `myShellyDevices: [ShellyDevice!]!` add:
```graphql
    shellyAccount: ShellyAccountInfo!
```

In the `Mutation` block, replace `addShellyDevice(name: String!): ShellyDevice!` with:
```graphql
    connectShellyAccount(authKey: String!, serverHost: String!): [ShellyCloudDevice!]!
    linkShellyDevice(deviceId: String!, name: String!): ShellyDevice!
    disconnectShellyAccount: Boolean!
```
(Keep `renameShellyDevice` and `removeShellyDevice` as-is.)

- [ ] **Step 2: Rework the resolver helpers + imports**

In `backend/src/resolvers.ts`, update the models import (line 5) to add `ShellyAccount`:
```ts
import { /* …existing… */ ShellyDevice, IShellyDevice, ShellyAccount } from './models';
```
Add near the other top imports:
```ts
import { encryptSecret } from './crypto';
import { listDevices } from './shellyCloud';
```
Replace `shellyToGraphQL` (the function returning the `mqtt*` fields) with:
```ts
function shellyToGraphQL(d: IShellyDevice) {
    return {
        id: String(d._id),
        deviceId: d.deviceId,
        name: d.name,
        lastSeenAt: d.lastSeenAt ? d.lastSeenAt.toISOString() : null,
        lastBatteryPercent: d.lastBatteryPercent ?? null,
        createdAt: d.createdAt.toISOString(),
    };
}
```
Delete the now-unused `generateShellyDeviceId` function.

- [ ] **Step 3: Add the `shellyAccount` query resolver**

In the `Query` resolver map, after the `myShellyDevices` resolver, add:
```ts
        shellyAccount: async (_: any, __: any, ctx: Ctx) => {
            if (!ctx.user) throw new Error('Unauthorized');
            const acc = await ShellyAccount.findOne({ userId: ctx.user.userId });
            return { connected: !!acc, status: acc?.status ?? 'none' };
        },
```

- [ ] **Step 4: Replace `addShellyDevice` with connect/link/disconnect**

In the `Mutation` resolver map, replace the entire `addShellyDevice` resolver block with:
```ts
        connectShellyAccount: async (_: any, args: { authKey: string; serverHost: string }, ctx: Ctx) => {
            if (!ctx.user) throw new Error('Unauthorized');
            const authKey = args.authKey.trim();
            const serverHost = args.serverHost.trim();
            if (!authKey || !serverHost) throw new Error('Auth key and server host are required');
            let devices;
            try {
                devices = await listDevices(serverHost, authKey);
            } catch {
                throw new Error("Couldn't reach Shelly Cloud with that key — double-check the key and server host");
            }
            await ShellyAccount.findOneAndUpdate(
                { userId: ctx.user.userId },
                { $set: { authKeyEnc: encryptSecret(authKey), serverHost, status: 'ok' } },
                { upsert: true },
            );
            return devices;
        },
        linkShellyDevice: async (_: any, args: { deviceId: string; name: string }, ctx: Ctx) => {
            if (!ctx.user) throw new Error('Unauthorized');
            const deviceId = args.deviceId.trim();
            const name = args.name.trim().slice(0, 60);
            if (!deviceId || !name) throw new Error('Device and name are required');
            const account = await ShellyAccount.findOne({ userId: ctx.user.userId });
            if (!account) throw new Error('Connect your Shelly account first');
            const existing = await ShellyDevice.findOne({ userId: ctx.user.userId });
            if (existing) throw new Error('You can only monitor one Shelly device per account');
            const created = await ShellyDevice.create({ userId: ctx.user.userId, deviceId, name });
            return shellyToGraphQL(created);
        },
        disconnectShellyAccount: async (_: any, __: any, ctx: Ctx) => {
            if (!ctx.user) throw new Error('Unauthorized');
            await ShellyDevice.deleteMany({ userId: ctx.user.userId });
            const res = await ShellyAccount.deleteOne({ userId: ctx.user.userId });
            return res.deletedCount > 0;
        },
```
(`renameShellyDevice` and `removeShellyDevice` stay unchanged — they already use `shellyToGraphQL`/delete.)

- [ ] **Step 5: Typecheck**

Run: `cd backend && npx tsc --noEmit`
Expected: fails only in `index.ts` (still imports `startMqttConsumer`). Task 7 fixes that. If any error mentions `mqtt*` fields or `generateShellyDeviceId`, fix the leftover reference.

- [ ] **Step 6: Commit**

```
git add backend/src/schema.ts backend/src/resolvers.ts
git commit -m "shelly: connect/link/disconnect resolvers; drop MQTT fields"
```

---

## Task 7: Wire poller into startup, remove MQTT

**Files:**
- Modify: `backend/src/index.ts`, `backend/.env.example`, `backend/package.json`
- Delete: `backend/src/mqttConsumer.ts`

- [ ] **Step 1: Swap the startup call**

In `backend/src/index.ts`:
- Replace `import { startMqttConsumer } from './mqttConsumer';` with `import { startShellyCloudPoller } from './shellyCloudPoller';`
- Replace the `startMqttConsumer();` call (line ~331) with `startShellyCloudPoller();`

- [ ] **Step 2: Delete the MQTT consumer**

```
git rm backend/src/mqttConsumer.ts
```

- [ ] **Step 3: Remove the `mqtt` dependency**

```
cd backend && npm uninstall mqtt
```
(Updates `package.json` + lockfile.)

- [ ] **Step 4: Update `.env.example`**

In `backend/.env.example`, remove the `MQTT_BROKER_URL`/`MQTT_PUBLIC_URL`/`MQTT_SERVER_PASSWORD`/`MQTT_PUBLISHER_USERNAME`/`MQTT_PUBLISHER_PASSWORD` lines and add:
```
# Shelly Cloud — symmetric key used to encrypt stored auth keys at rest (any long random string)
SHELLY_ENC_KEY=change-me-to-a-long-random-string
```

- [ ] **Step 5: Final backend typecheck**

Run: `cd backend && npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 6: Commit**

```
git add backend/src/index.ts backend/.env.example backend/package.json backend/package-lock.json
git commit -m "shelly: start cloud poller, remove MQTT consumer + dependency"
```

---

## Task 8: Frontend service

**Files:**
- Modify: `frontend/src/app/core/services/shelly.service.ts`

- [ ] **Step 1: Update the interface + fragment**

In `frontend/src/app/core/services/shelly.service.ts`, replace the `ShellyDevice` interface with:
```ts
export interface ShellyDevice {
  id: string;
  deviceId: string;
  name: string;
  lastSeenAt: string | null;
  lastBatteryPercent: number | null;
  createdAt: string;
}

export interface ShellyCloudDevice {
  id: string;
  name: string;
  online: boolean;
}

export interface ShellyAccountInfo {
  connected: boolean;
  status: string;
}
```
Replace the `SHELLY_FIELDS` constant with:
```ts
const SHELLY_FIELDS = `id deviceId name lastSeenAt lastBatteryPercent createdAt`;
```

- [ ] **Step 2: Add the account query + connect/link/disconnect methods**

Inside the `ShellyService` class, add (alongside the existing `list`/`rename`/`remove` methods; keep those):
```ts
  account(): Observable<ShellyAccountInfo> {
    return defer(() =>
      this.apolloClient.query<{ shellyAccount: ShellyAccountInfo }>({
        query: gql`query ShellyAccount { shellyAccount { connected status } }`,
        fetchPolicy: 'network-only',
      }).then(r => r.data.shellyAccount)
    );
  }

  connectAccount(authKey: string, serverHost: string): Observable<ShellyCloudDevice[]> {
    return defer(() =>
      this.apolloClient.mutate<{ connectShellyAccount: ShellyCloudDevice[] }>({
        mutation: gql`
          mutation ConnectShelly($authKey: String!, $serverHost: String!) {
            connectShellyAccount(authKey: $authKey, serverHost: $serverHost) { id name online }
          }
        `,
        variables: { authKey, serverHost },
      }).then(r => r.data!.connectShellyAccount)
    );
  }

  linkDevice(deviceId: string, name: string): Observable<ShellyDevice> {
    return defer(() =>
      this.apolloClient.mutate<{ linkShellyDevice: ShellyDevice }>({
        mutation: gql`
          mutation LinkShelly($deviceId: String!, $name: String!) {
            linkShellyDevice(deviceId: $deviceId, name: $name) { ${SHELLY_FIELDS} }
          }
        `,
        variables: { deviceId, name },
      }).then(r => r.data!.linkShellyDevice)
    );
  }

  disconnectAccount(): Observable<boolean> {
    return defer(() =>
      this.apolloClient.mutate<{ disconnectShellyAccount: boolean }>({
        mutation: gql`mutation DisconnectShelly { disconnectShellyAccount }`,
      }).then(r => r.data!.disconnectShellyAccount)
    );
  }
```
If `add` (the old `addShellyDevice` caller) exists, delete that method.

- [ ] **Step 3: Typecheck**

Run: `cd frontend && npx tsc -p tsconfig.app.json --noEmit`
Expected: fails in the wizard/setup components (still reference old `add`/mqtt). Tasks 9 fixes them.

- [ ] **Step 4: Commit**

```
git add frontend/src/app/core/services/shelly.service.ts
git commit -m "shelly: service for cloud connect/link/disconnect"
```

---

## Task 9: Frontend connect flow + settings + i18n

**Files:**
- Create: `frontend/src/app/features/settings/shelly-connect.component.ts`
- Modify: `frontend/src/app/features/settings/shelly-setup.component.ts`, `frontend/src/app/features/settings/settings.component.ts` (only if it imports the wizard)
- Delete: `frontend/src/app/features/settings/shelly-pairing-wizard.component.ts`
- Modify: `frontend/public/i18n/en.json`, `frontend/public/i18n/da.json`

- [ ] **Step 1: Create the connect-flow component**

Create `frontend/src/app/features/settings/shelly-connect.component.ts`:

```ts
import { Component, inject, output, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { TranslocoDirective } from '@jsverse/transloco';
import { ShellyService, ShellyCloudDevice } from '../../core/services/shelly.service';

@Component({
  selector: 'app-shelly-connect',
  imports: [FormsModule, TranslocoDirective],
  template: `
    <div class="fixed inset-0 z-[60] bg-white flex flex-col" *transloco="let t">
      <div class="flex items-center justify-between px-4 py-3 border-b border-gray-100">
        <h1 class="text-[15px] font-medium text-gray-800">{{ t('shelly.connect.title') }}</h1>
        <button (click)="closed.emit()" class="text-[13px] text-gray-500 hover:text-gray-700">✕</button>
      </div>

      <div class="flex-1 overflow-y-auto px-5 py-6 max-w-lg w-full mx-auto space-y-5">
        @if (devices() === null) {
          <p class="text-[14px] text-gray-600 leading-relaxed whitespace-pre-line">{{ t('shelly.connect.intro') }}</p>
          <div class="space-y-3">
            <div>
              <label class="text-[12px] text-gray-500">{{ t('shelly.connect.authKeyLabel') }}</label>
              <input type="text" [ngModel]="authKey()" (ngModelChange)="authKey.set($event)"
                     class="w-full shadow-gw-sm rounded-xl px-3.5 py-3 text-[14px] outline-none focus:border-gw-green" />
            </div>
            <div>
              <label class="text-[12px] text-gray-500">{{ t('shelly.connect.serverLabel') }}</label>
              <input type="text" [ngModel]="serverHost()" (ngModelChange)="serverHost.set($event)"
                     placeholder="shelly-XX-eu.shelly.cloud"
                     class="w-full shadow-gw-sm rounded-xl px-3.5 py-3 text-[14px] outline-none focus:border-gw-green" />
            </div>
          </div>
          @if (error()) { <p class="text-[13px] text-red-500">{{ error() }}</p> }
          <button (click)="connect()" [disabled]="!canConnect() || busy()"
                  class="w-full bg-gw-green text-white text-[14px] py-3 rounded-xl font-medium disabled:opacity-40">
            {{ busy() ? t('shelly.connect.connecting') : t('shelly.connect.connectCta') }}
          </button>
        } @else {
          <p class="text-[14px] text-gray-600">{{ t('shelly.connect.pickDevice') }}</p>
          @for (d of devices(); track d.id) {
            <button (click)="link(d)" [disabled]="busy()"
                    class="w-full text-left bg-gw-surface shadow-gw-sm rounded-xl p-3 hover:bg-gw-green-light/40 disabled:opacity-40">
              <div class="text-[14px] text-gray-800">{{ d.name }}</div>
              <div class="text-[11px] text-gray-400">{{ d.id }} · {{ d.online ? t('shelly.connect.online') : t('shelly.connect.offline') }}</div>
            </button>
          }
          @if (devices()!.length === 0) { <p class="text-[13px] text-gray-400">{{ t('shelly.connect.noneFound') }}</p> }
          @if (error()) { <p class="text-[13px] text-red-500">{{ error() }}</p> }
        }
      </div>
    </div>
  `,
})
export class ShellyConnectComponent {
  private shelly = inject(ShellyService);

  closed = output<void>();
  completed = output<void>();

  authKey = signal('');
  serverHost = signal('');
  devices = signal<ShellyCloudDevice[] | null>(null);
  busy = signal(false);
  error = signal<string | null>(null);

  canConnect() { return this.authKey().trim().length > 0 && this.serverHost().trim().length > 0; }

  connect() {
    if (!this.canConnect() || this.busy()) return;
    this.busy.set(true); this.error.set(null);
    this.shelly.connectAccount(this.authKey().trim(), this.serverHost().trim()).subscribe({
      next: list => { this.devices.set(list); this.busy.set(false); },
      error: err => { this.error.set(err?.message ?? 'Failed to connect'); this.busy.set(false); },
    });
  }

  link(d: ShellyCloudDevice) {
    if (this.busy()) return;
    this.busy.set(true); this.error.set(null);
    this.shelly.linkDevice(d.id, d.name).subscribe({
      next: () => { this.busy.set(false); this.completed.emit(); },
      error: err => { this.error.set(err?.message ?? 'Failed to link'); this.busy.set(false); },
    });
  }
}
```

- [ ] **Step 2: Point the settings page at the new component**

In `frontend/src/app/features/settings/shelly-setup.component.ts`:
- Replace any import of `ShellyPairingWizardComponent` / `app-shelly-pairing-wizard` usage with `ShellyConnectComponent` / `<app-shelly-connect>`.
- The component is opened where "Add Shelly" used to open the wizard. Bind `(completed)` and `(closed)` to the existing handlers (reload list + close).
- Add a **Disconnect** action: call `this.shelly.disconnectAccount().subscribe(() => this.reload())` (wire to a button using `t('shelly.disconnect')`, mirroring the existing `remove` button pattern).
- If the page shows a "reconnect needed" state, gate it on `shelly.account()` returning `status === 'auth_error'` (fetch in the existing load/`reload` path and store in a signal; show `t('shelly.reconnectNeeded')`).

Read the current `shelly-setup.component.ts` first and follow its existing signal/handler patterns; keep the change minimal and consistent.

- [ ] **Step 3: Delete the old wizard + fix any reference**

```
git rm frontend/src/app/features/settings/shelly-pairing-wizard.component.ts
```
Grep for remaining references and update them:
```
grep -rn "shelly-pairing-wizard\|ShellyPairingWizard" frontend/src
```
Expected after edits: no matches. If `settings.component.ts` imported it, switch it to `ShellyConnectComponent` the same way.

- [ ] **Step 4: Update i18n (en.json)**

In `frontend/public/i18n/en.json`, remove the entire `shelly.wizard` object and add a `shelly.connect` object plus the new top-level shelly keys. Inside `"shelly"`, replace the `"wizard": { … }` block with:
```json
    "connect": {
      "title": "Connect your Shelly",
      "intro": "First, set up your Shelly H&T in the Shelly Smart Control app (insert the battery and follow the app — it handles Wi-Fi for you).\n\nThen, in the Shelly app, open User Settings → Authorization cloud key and copy the two values below.",
      "authKeyLabel": "Authorization cloud key",
      "serverLabel": "Server host",
      "connectCta": "Connect",
      "connecting": "Connecting…",
      "pickDevice": "Pick the sensor you want to monitor:",
      "online": "online",
      "offline": "offline",
      "noneFound": "No devices found on this account. Make sure your Shelly is set up in the Shelly app first.",
      "connectMissing": "Connect your Shelly account to start streaming readings."
    },
    "disconnect": "Disconnect Shelly account",
    "disconnectConfirm": "Disconnect your Shelly account? Your device and past readings stay, but new readings will stop.",
    "reconnectNeeded": "Your Shelly connection expired — reconnect to keep receiving readings."
```
(Keep all the existing non-wizard shelly keys: `title`, `addDevice`, `battery`, `remove`, `lastSeen*`, etc. Note: `addDevice` label can stay; it now opens the connect flow.)

- [ ] **Step 5: Update i18n (da.json)**

In `frontend/public/i18n/da.json`, apply the parallel change — remove `shelly.wizard`, add:
```json
    "connect": {
      "title": "Forbind din Shelly",
      "intro": "Opsæt først din Shelly H&T i Shelly Smart Control-appen (sæt batteriet i og følg appen — den klarer Wi-Fi for dig).\n\nÅbn derefter User Settings → Authorization cloud key i Shelly-appen og kopiér de to værdier nedenfor.",
      "authKeyLabel": "Authorization cloud key",
      "serverLabel": "Serveradresse",
      "connectCta": "Forbind",
      "connecting": "Forbinder…",
      "pickDevice": "Vælg den sensor du vil overvåge:",
      "online": "online",
      "offline": "offline",
      "noneFound": "Ingen enheder fundet på denne konto. Sørg for at din Shelly er sat op i Shelly-appen først.",
      "connectMissing": "Forbind din Shelly-konto for at begynde at modtage målinger."
    },
    "disconnect": "Frakobl Shelly-konto",
    "disconnectConfirm": "Frakobl din Shelly-konto? Din enhed og tidligere målinger bevares, men nye målinger stopper.",
    "reconnectNeeded": "Din Shelly-forbindelse er udløbet — forbind igen for at fortsætte med at modtage målinger."
```
(Shelly-app field names like "Authorization cloud key" stay in English in both files, matching the app UI.)

- [ ] **Step 6: Verify**

Run: `cd frontend && npx tsc -p tsconfig.app.json --noEmit`
Expected: no errors.

Run: `node -e "JSON.parse(require('fs').readFileSync('frontend/public/i18n/en.json','utf8'));JSON.parse(require('fs').readFileSync('frontend/public/i18n/da.json','utf8'));console.log('JSON OK')"`
Expected: `JSON OK`

Run: `grep -rn "shelly-pairing-wizard\|ShellyPairingWizard\|mqtt" frontend/src`
Expected: no matches.

- [ ] **Step 7: Commit**

```
git add frontend/src frontend/public/i18n
git commit -m "shelly: replace pairing wizard with cloud account connect flow"
```

---

## Task 10: Final verification + decommission notes

**Files:** none (verification).

- [ ] **Step 1: Full typecheck both sides**

```
cd backend && npx tsc --noEmit
cd ../frontend && npx tsc -p tsconfig.app.json --noEmit
```
Expected: both clean.

- [ ] **Step 2: Manual end-to-end (record result)**

1. Set `SHELLY_ENC_KEY` locally (and on Railway). Start backend (`npm run dev`) + frontend (`npm start`).
2. Settings → Shelly → Connect → paste the real auth key + server host → confirm devices list.
3. Link the H&T → confirm it appears on the settings page.
4. Within ~5 min confirm a reading appears on the dashboard and battery/last-seen populate. (Or trigger a manual poll by restarting the backend.)
5. Disconnect → confirm device + account removed.

- [ ] **Step 3: Operator decommission (do after Railway deploy)**

- Add `SHELLY_ENC_KEY` (32-byte random) to Railway backend vars.
- Remove the `MQTT_BROKER_URL`/`MQTT_PUBLIC_URL`/`MQTT_SERVER_PASSWORD`/`MQTT_PUBLISHER_USERNAME`/`MQTT_PUBLISHER_PASSWORD` Railway vars.
- Delete the HiveMQ Cloud cluster.

---

## Self-review notes

- **Spec coverage:**
  - Auth-key linking → Task 6 `connectShellyAccount` + Task 9 connect UI.
  - Encrypted-at-rest auth key, never exposed → Task 2 crypto + `authKeyEnc` (Task 3) + `shellyAccount` returns only `{connected,status}` (Task 6).
  - `ShellyAccount` model + `ShellyDevice` reshape (`lastReportedAt`, real serial) → Task 3.
  - Cloud client (list + status + mapStatus + ShellyAuthError) → Task 4.
  - 5-min poller + dedup via `lastReportedAt` → Task 5.
  - Resolvers/schema rework, drop `addShellyDevice` + MQTT fields, add `shellyAccount` → Task 6.
  - Start poller, delete `mqttConsumer.ts`, remove `mqtt` dep + env, add `SHELLY_ENC_KEY` → Task 7.
  - Frontend service + connect flow + settings (disconnect/reconnect) + i18n (en+da) → Tasks 8–9.
  - Confirm cloud JSON shapes first → Task 1.
  - Decommission HiveMQ + env → Task 10.
- **Type consistency:** `ShellyCloudDevice {id,name,online}`, `ShellyCloudStatus {id,temperature?,humidity?,batteryPercent?,reportedAt}`, `ShellyAccountInfo {connected,status}` used identically across `shellyCloud.ts`, poller, resolvers, schema, and the frontend service/component. `handleSensorData({deviceId,temperature,humidity,userId})` matches the existing signature the MQTT consumer used. `mapStatus`/`pickNewReadings`/`encryptSecret`/`decryptSecret` names consistent across definition, verification snippets, and callers.
- **No placeholders:** every code step ships complete code; the only deliberately deferred item is the live-API shape confirmation (Task 1), which feeds `mapStatus`/endpoints in Task 4 — the standard way to plan against an external API, with uncertainty localized to one pure function and two URLs.
- **Test convention:** backend has no runner; pure functions verified via `ts-node` assertion snippets, the rest via `tsc` + manual — consistent with the existing codebase.
```
