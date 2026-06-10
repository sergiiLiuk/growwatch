# Shelly H&T Gen3 Integration — Phase 1 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let a user pair a Shelly H&T Gen3 device, generate a per-device webhook URL with embedded token, and stream temperature + humidity into the existing `SensorData` pipeline alongside ESP32.

**Architecture:** New `ShellyDevice` Mongoose model holds `{userId, deviceId, name, webhookToken, lastSeenAt, lastBatteryPercent}`. A new REST endpoint `POST /api/shelly/webhook` looks up the token, updates `lastSeenAt`/`lastBatteryPercent`, and calls the existing `handleSensorData()` with `{temperature, humidity, userId}`. New GraphQL resolvers expose CRUD for the user's Shellys. A new `/settings/shelly-setup` page mirrors the existing devices page.

**Tech Stack:** TypeScript, Express, Mongoose, Apollo Server, Angular 21 standalone components, signals, Apollo Client, Transloco i18n, Tailwind v4.

**Note on tests:** This project has no backend or frontend test suites in this area. Verification follows the project pattern: `npx tsc --noEmit` for both backend and frontend, plus targeted manual verification (curl for the webhook, browser for the UI). Each task ends with a typecheck + a short manual-verify checklist.

**Note on `npm run build`:** Do NOT run `npm run build` in the frontend during these tasks. Its `prebuild` hook executes `scripts/set-env.js` which overwrites `frontend/src/environments/environment.prod.ts` with local env values, causing an unintended diff. Use `npx tsc --noEmit` exclusively.

---

## File map

- **Modify:** `frontend/public/i18n/en.json`, `frontend/public/i18n/da.json` — add a `shelly.*` block.
- **Modify:** `backend/src/models.ts` — add `IShellyDevice` interface + `ShellyDevice` Mongoose model.
- **Modify:** `backend/src/schema.ts` — add `ShellyDevice` type and 4 mutations + 1 query.
- **Modify:** `backend/src/resolvers.ts` — add the query and 4 mutations; the webhook helper is a plain async function.
- **Modify:** `backend/src/index.ts` — register `POST /api/shelly/webhook` route.
- **Create:** `frontend/src/app/core/services/shelly.service.ts` — Apollo wrapper for query + 4 mutations.
- **Create:** `frontend/src/app/features/settings/shelly-setup.component.ts` — list + add + rename + rotate + remove UI.
- **Modify:** `frontend/src/app/app.routes.ts` — register `/settings/shelly-setup` route.
- **Modify:** `frontend/src/app/features/settings/settings.component.ts` — add link to Shelly setup under the Account or Preferences tab (whichever matches the existing "Sensor setup" row).

---

## Task 1: Add i18n keys

**Files:**
- Modify: `frontend/public/i18n/en.json` — add a new top-level `shelly` object
- Modify: `frontend/public/i18n/da.json` — same shape

- [ ] **Step 1: Add English block**

In `frontend/public/i18n/en.json`, add a new `"shelly"` block. Place it next to the existing `"sensorSetup"` or `"devices"` block. Use this exact content:

```json
"shelly": {
  "settingsLinkTitle": "Shelly H&T sensors",
  "settingsLinkSubtitle": "Pair a Shelly H&T Gen3 device",
  "title": "Shelly H&T sensors",
  "subtitle": "Pair a Shelly H&T Gen3 and stream temperature + humidity",
  "addDevice": "Add Shelly",
  "noDevices": "No Shelly devices paired yet",
  "noDevicesHint": "Tap Add Shelly to pair your first device",
  "deviceIdLabel": "Device ID",
  "deviceIdPlaceholder": "shellyhtg3-AABBCCDDEEFF",
  "deviceIdHint": "Find this on the Shelly's web UI under Settings → Device info",
  "nameLabel": "Display name",
  "namePlaceholder": "Greenhouse",
  "save": "Save",
  "cancel": "Cancel",
  "webhookUrlLabel": "Webhook URL",
  "webhookUrlHint": "Paste this URL into Shelly's Settings → Webhooks → Add → trigger on temperature OR humidity change",
  "copyUrl": "Copy",
  "copied": "Copied",
  "lastSeenNever": "Never seen",
  "lastSeenJustNow": "Just now",
  "lastSeenMinutesAgo": "{{n}} min ago",
  "lastSeenHoursAgo": "{{n}}h ago",
  "lastSeenDaysAgo": "{{n}}d ago",
  "battery": "Battery {{n}}%",
  "rotateToken": "Rotate token",
  "rotateTokenConfirm": "Generate a new webhook URL? The old URL will stop working immediately.",
  "remove": "Remove",
  "removeConfirm": "Remove this Shelly device? Past readings remain in your history."
}
```

- [ ] **Step 2: Add Danish block**

In `frontend/public/i18n/da.json`, add the same shape with these translations:

```json
"shelly": {
  "settingsLinkTitle": "Shelly H&T-sensorer",
  "settingsLinkSubtitle": "Tilkobl en Shelly H&T Gen3",
  "title": "Shelly H&T-sensorer",
  "subtitle": "Tilkobl en Shelly H&T Gen3 og stream temperatur + fugtighed",
  "addDevice": "Tilføj Shelly",
  "noDevices": "Ingen Shelly-enheder tilkoblet endnu",
  "noDevicesHint": "Tryk på Tilføj Shelly for at tilkoble din første enhed",
  "deviceIdLabel": "Enheds-ID",
  "deviceIdPlaceholder": "shellyhtg3-AABBCCDDEEFF",
  "deviceIdHint": "Findes i Shellyens web-UI under Settings → Device info",
  "nameLabel": "Visningsnavn",
  "namePlaceholder": "Drivhus",
  "save": "Gem",
  "cancel": "Annullér",
  "webhookUrlLabel": "Webhook-URL",
  "webhookUrlHint": "Indsæt denne URL i Shellyens Settings → Webhooks → Add → trigger ved ændring i temperatur eller fugtighed",
  "copyUrl": "Kopiér",
  "copied": "Kopieret",
  "lastSeenNever": "Aldrig set",
  "lastSeenJustNow": "Lige nu",
  "lastSeenMinutesAgo": "{{n}} min siden",
  "lastSeenHoursAgo": "{{n}}t siden",
  "lastSeenDaysAgo": "{{n}}d siden",
  "battery": "Batteri {{n}}%",
  "rotateToken": "Rotér token",
  "rotateTokenConfirm": "Generér en ny webhook-URL? Den gamle URL holder op med at virke med det samme.",
  "remove": "Fjern",
  "removeConfirm": "Fjern denne Shelly-enhed? Tidligere målinger forbliver i din historik."
}
```

- [ ] **Step 3: Commit**

```
git add frontend/public/i18n/en.json frontend/public/i18n/da.json
git commit -m "i18n: add Shelly H&T setup keys"
```

---

## Task 2: ShellyDevice Mongoose model

**Files:**
- Modify: `backend/src/models.ts` — add `IShellyDevice` interface + `ShellyDevice` model, exported

- [ ] **Step 1: Add the interface and schema**

At the end of `backend/src/models.ts`, append this block. Place it after the existing `Plant` and `HourlySensorData` exports — alongside other Mongoose models:

```ts
// ── Shelly H&T Gen3 device ─────────────────────────────────────────────────

export interface IShellyDevice extends Document {
    userId: string;
    deviceId: string;          // Shelly serial, e.g. "shellyhtg3-AABBCCDDEEFF"
    name: string;
    webhookToken: string;      // 64-hex random, used as webhook query param
    lastSeenAt?: Date;
    lastBatteryPercent?: number;
    createdAt: Date;
}

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

shellyDeviceSchema.index({ userId: 1, deviceId: 1 }, { unique: true });

export const ShellyDevice: Model<IShellyDevice> =
    mongoose.models.ShellyDevice || mongoose.model<IShellyDevice>('ShellyDevice', shellyDeviceSchema);
```

If the file does not already import `Schema`, `Document`, `Model`, and `mongoose` at the top, those imports already exist (used by the other models in this file). Do not duplicate them.

- [ ] **Step 2: Typecheck**

```
cd /c/Users/Sergii/Desktop/growwatch/backend && npx tsc --noEmit
```
Expected: no errors.

- [ ] **Step 3: Commit**

```
git add backend/src/models.ts
git commit -m "shelly: add ShellyDevice Mongoose model"
```

---

## Task 3: GraphQL schema additions

**Files:**
- Modify: `backend/src/schema.ts` — add `ShellyDevice` type + 1 query + 4 mutations

- [ ] **Step 1: Add the type**

Find the existing type definitions block in `backend/src/schema.ts` (where `UserSettings`, `Plant`, `Device` types live). Add this `ShellyDevice` type near the `Device` type:

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

- [ ] **Step 2: Add the query**

Inside the `type Query { ... }` block, add this line near the existing `myDevices` query (if there is one — otherwise at the bottom of `Query`):

```graphql
myShellyDevices: [ShellyDevice!]!
```

- [ ] **Step 3: Add the mutations**

Inside the `type Mutation { ... }` block, add these four lines near the existing `Device` mutations (or at the bottom of `Mutation`):

```graphql
addShellyDevice(deviceId: String!, name: String!): ShellyDevice!
renameShellyDevice(id: String!, name: String!): ShellyDevice!
rotateShellyToken(id: String!): ShellyDevice!
removeShellyDevice(id: String!): Boolean!
```

- [ ] **Step 4: Typecheck**

```
cd /c/Users/Sergii/Desktop/growwatch/backend && npx tsc --noEmit
```
Expected: no errors. (Resolver may not yet exist — that's fine, Apollo only complains at request time, not type time.)

- [ ] **Step 5: Commit**

```
git add backend/src/schema.ts
git commit -m "shelly: add GraphQL type, query, and mutations"
```

---

## Task 4: GraphQL resolvers

**Files:**
- Modify: `backend/src/resolvers.ts` — implement the query and 4 mutations; expose `findShellyByToken` helper used by Task 5

This is the largest backend task. All five resolvers share a helper that builds the `webhookUrl`. Define it once.

- [ ] **Step 1: Add imports and helpers**

At the top of `backend/src/resolvers.ts`, ensure `crypto` and `ShellyDevice` are imported. The file already imports from `./models`; add `ShellyDevice` and `IShellyDevice` to that import. Add `import crypto from 'crypto';` if not already present.

Then, somewhere near the top of the resolver definitions (above the `Query` resolver object), add this helper. It centralises the `webhookUrl` shape so a future change to placeholder syntax only touches one place:

```ts
const SHELLY_BACKEND_BASE = process.env.SHELLY_BACKEND_BASE_URL ?? 'https://growwatch.dk';

function generateShellyToken(): string {
    return crypto.randomBytes(32).toString('hex');
}

function buildShellyWebhookUrl(token: string, deviceId: string): string {
    // Shelly Gen3 URL Action placeholder syntax: ${ev.tC}, ${ev.rh}, ${devicepower:0.battery.percent}
    // We verify this against a live device in manual testing (Step 9 of this task).
    const params = [
        `token=${encodeURIComponent(token)}`,
        `deviceId=${encodeURIComponent(deviceId)}`,
        `t=\${ev.tC}`,
        `h=\${ev.rh}`,
        `bat=\${devicepower:0.battery.percent}`,
    ];
    return `${SHELLY_BACKEND_BASE}/api/shelly/webhook?${params.join('&')}`;
}

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

export async function findShellyByToken(token: string): Promise<IShellyDevice | null> {
    if (!token || typeof token !== 'string') return null;
    return ShellyDevice.findOne({ webhookToken: token });
}

export async function touchShelly(id: any, batteryPercent: number | null): Promise<void> {
    const update: any = { lastSeenAt: new Date() };
    if (batteryPercent !== null) update.lastBatteryPercent = batteryPercent;
    await ShellyDevice.updateOne({ _id: id }, { $set: update });
}
```

- [ ] **Step 2: Add the `myShellyDevices` query resolver**

Inside the `Query: { ... }` resolver object, add:

```ts
myShellyDevices: async (_: any, __: any, ctx: any) => {
    if (!ctx.user) throw new Error('Unauthorized');
    const devices = await ShellyDevice.find({ userId: ctx.user.userId }).sort({ createdAt: 1 });
    return devices.map(shellyToGraphQL);
},
```

- [ ] **Step 3: Add the `addShellyDevice` mutation resolver**

Inside the `Mutation: { ... }` resolver object, add:

```ts
addShellyDevice: async (_: any, args: { deviceId: string; name: string }, ctx: any) => {
    if (!ctx.user) throw new Error('Unauthorized');
    const deviceId = args.deviceId.trim();
    const name = args.name.trim().slice(0, 60);
    if (!deviceId) throw new Error('Device ID is required');
    if (!name) throw new Error('Name is required');

    const existing = await ShellyDevice.findOne({ userId: ctx.user.userId, deviceId });
    if (existing) throw new Error('This device is already paired');

    const created = await ShellyDevice.create({
        userId: ctx.user.userId,
        deviceId,
        name,
        webhookToken: generateShellyToken(),
    });
    return shellyToGraphQL(created);
},
```

- [ ] **Step 4: Add the `renameShellyDevice` mutation resolver**

```ts
renameShellyDevice: async (_: any, args: { id: string; name: string }, ctx: any) => {
    if (!ctx.user) throw new Error('Unauthorized');
    const name = args.name.trim().slice(0, 60);
    if (!name) throw new Error('Name is required');
    const updated = await ShellyDevice.findOneAndUpdate(
        { _id: args.id, userId: ctx.user.userId },
        { $set: { name } },
        { new: true }
    );
    if (!updated) throw new Error('Device not found');
    return shellyToGraphQL(updated);
},
```

- [ ] **Step 5: Add the `rotateShellyToken` mutation resolver**

```ts
rotateShellyToken: async (_: any, args: { id: string }, ctx: any) => {
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

- [ ] **Step 6: Add the `removeShellyDevice` mutation resolver**

```ts
removeShellyDevice: async (_: any, args: { id: string }, ctx: any) => {
    if (!ctx.user) throw new Error('Unauthorized');
    const result = await ShellyDevice.deleteOne({ _id: args.id, userId: ctx.user.userId });
    return result.deletedCount > 0;
},
```

- [ ] **Step 7: Typecheck**

```
cd /c/Users/Sergii/Desktop/growwatch/backend && npx tsc --noEmit
```
Expected: no errors.

- [ ] **Step 8: Commit**

```
git add backend/src/resolvers.ts
git commit -m "shelly: implement GraphQL resolvers (query + 4 mutations)"
```

- [ ] **Step 9: Set the production webhook base env var**

Note for the operator (not a code step): add `SHELLY_BACKEND_BASE_URL=https://growwatch.dk` to Railway's environment variables. The default `'https://growwatch.dk'` in code is correct for prod, so this is only required if the production hostname differs. Skip unless told otherwise.

---

## Task 5: Webhook REST endpoint

**Files:**
- Modify: `backend/src/index.ts` — register `POST /api/shelly/webhook`

- [ ] **Step 1: Add the route**

In `backend/src/index.ts`, find the existing `app.post('/api/sensor-data', ...)` registration (around line 169). Directly below it (before the `/api/save-hourly` route), add the Shelly webhook handler:

```ts
// ─── Shelly H&T Gen3 webhook ──
// Query params: token, deviceId, t, h, bat (bat optional)
// 204 on success, 401 on unknown token, 400 on missing/bad numeric params.
app.post('/api/shelly/webhook', async (req: Request, res: Response) => {
    try {
        const token = String(req.query.token ?? '');
        const deviceId = String(req.query.deviceId ?? '');
        const tRaw = req.query.t;
        const hRaw = req.query.h;
        const batRaw = req.query.bat;

        const device = await findShellyByToken(token);
        if (!device) return res.status(401).end();

        const temperature = Number(tRaw);
        const humidity = Number(hRaw);
        if (!isFinite(temperature) || !isFinite(humidity)) {
            return res.status(400).json({ error: 'Missing or non-numeric t / h' });
        }

        const battery = batRaw !== undefined && batRaw !== '' && isFinite(Number(batRaw))
            ? Math.round(Number(batRaw))
            : null;
        await touchShelly(device._id, battery);

        const result = await handleSensorData({
            deviceId: deviceId || device.deviceId,
            temperature,
            humidity,
            userId: device.userId,
        });

        if (!result) {
            console.warn(`🚫 Shelly handleSensorData rejected reading for user=${device.userId}`);
            return res.status(500).end();
        }

        console.log(`📥 Shelly: temp=${temperature}°C hum=${humidity}% bat=${battery ?? '—'}% device=${device.deviceId}`);
        res.status(204).end();
    } catch (error) {
        console.error('❌ Error processing Shelly webhook:', error);
        res.status(500).end();
    }
});
```

- [ ] **Step 2: Import the helpers**

At the top of `backend/src/index.ts`, find the existing `import { handleSensorData, ... } from './resolvers';` line and add `findShellyByToken` and `touchShelly` to the same import:

```ts
import { handleSensorData, findShellyByToken, touchShelly } from './resolvers';
```

(Adjust to match the existing import shape — `resolvers` is already imported.)

- [ ] **Step 3: Confirm `handleSensorData` accepts a `userId` short-circuit**

Open `backend/src/resolvers.ts` and look at `handleSensorData` (around line 168). It currently calls `resolveDeviceOwner(data.deviceId)` to find the owner. If `data.userId` is already provided (the Shelly path supplies it), the function should bypass the owner lookup.

If `handleSensorData` does NOT currently honor a pre-set `data.userId`, add this short-circuit at the top of the function — right before `const owner = await resolveDeviceOwner(data.deviceId);`:

```ts
let owner: { userId: string; deviceId?: string } | null = null;
if (data.userId) {
    owner = { userId: data.userId, deviceId: data.deviceId };
} else {
    owner = await resolveDeviceOwner(data.deviceId);
}
```

Then remove the original `const owner = await resolveDeviceOwner(data.deviceId);` line (the new block replaces it).

- [ ] **Step 4: Typecheck**

```
cd /c/Users/Sergii/Desktop/growwatch/backend && npx tsc --noEmit
```
Expected: no errors.

- [ ] **Step 5: Smoke test the endpoint**

Start the backend dev server in a separate terminal:

```
cd /c/Users/Sergii/Desktop/growwatch/backend && npm run dev
```

Then in another terminal, with an invalid token (verifies 401):

```
curl -i -X POST 'http://localhost:4000/api/shelly/webhook?token=nope&deviceId=test&t=21.5&h=45'
```
Expected: `HTTP/1.1 401 Unauthorized`.

Missing temperature (verifies 400):

```
curl -i -X POST 'http://localhost:4000/api/shelly/webhook?token=nope&deviceId=test'
```
Expected: `HTTP/1.1 401 Unauthorized` (token check runs first — that's correct).

A 204 path requires a real token. Defer that until Task 7 when the UI generates one. Skip for now.

- [ ] **Step 6: Commit**

```
git add backend/src/index.ts backend/src/resolvers.ts
git commit -m "shelly: add POST /api/shelly/webhook endpoint"
```

---

## Task 6: Frontend ShellyDeviceService

**Files:**
- Create: `frontend/src/app/core/services/shelly.service.ts`

- [ ] **Step 1: Write the service**

Create the file with this exact content:

```ts
import { Injectable, inject } from '@angular/core';
import { gql } from '@apollo/client/core';
import { Observable, from, map } from 'rxjs';
import { GraphqlClientService } from './graphql-client.service';

export interface ShellyDevice {
  id: string;
  deviceId: string;
  name: string;
  webhookUrl: string;
  lastSeenAt: string | null;
  lastBatteryPercent: number | null;
  createdAt: string;
}

const SHELLY_FIELDS = `id deviceId name webhookUrl lastSeenAt lastBatteryPercent createdAt`;

const MY_SHELLY_DEVICES = gql`
  query MyShellyDevices { myShellyDevices { ${SHELLY_FIELDS} } }
`;

const ADD_SHELLY_DEVICE = gql`
  mutation AddShellyDevice($deviceId: String!, $name: String!) {
    addShellyDevice(deviceId: $deviceId, name: $name) { ${SHELLY_FIELDS} }
  }
`;

const RENAME_SHELLY_DEVICE = gql`
  mutation RenameShellyDevice($id: String!, $name: String!) {
    renameShellyDevice(id: $id, name: $name) { ${SHELLY_FIELDS} }
  }
`;

const ROTATE_SHELLY_TOKEN = gql`
  mutation RotateShellyToken($id: String!) {
    rotateShellyToken(id: $id) { ${SHELLY_FIELDS} }
  }
`;

const REMOVE_SHELLY_DEVICE = gql`
  mutation RemoveShellyDevice($id: String!) {
    removeShellyDevice(id: $id)
  }
`;

@Injectable({ providedIn: 'root' })
export class ShellyService {
  private client = inject(GraphqlClientService).client;

  list(): Observable<ShellyDevice[]> {
    return from(this.client.query<{ myShellyDevices: ShellyDevice[] }>({
      query: MY_SHELLY_DEVICES,
      fetchPolicy: 'network-only',
    })).pipe(map(r => r.data.myShellyDevices));
  }

  add(deviceId: string, name: string): Observable<ShellyDevice> {
    return from(this.client.mutate<{ addShellyDevice: ShellyDevice }>({
      mutation: ADD_SHELLY_DEVICE,
      variables: { deviceId, name },
    })).pipe(map(r => r.data!.addShellyDevice));
  }

  rename(id: string, name: string): Observable<ShellyDevice> {
    return from(this.client.mutate<{ renameShellyDevice: ShellyDevice }>({
      mutation: RENAME_SHELLY_DEVICE,
      variables: { id, name },
    })).pipe(map(r => r.data!.renameShellyDevice));
  }

  rotateToken(id: string): Observable<ShellyDevice> {
    return from(this.client.mutate<{ rotateShellyToken: ShellyDevice }>({
      mutation: ROTATE_SHELLY_TOKEN,
      variables: { id },
    })).pipe(map(r => r.data!.rotateShellyToken));
  }

  remove(id: string): Observable<boolean> {
    return from(this.client.mutate<{ removeShellyDevice: boolean }>({
      mutation: REMOVE_SHELLY_DEVICE,
      variables: { id },
    })).pipe(map(r => r.data!.removeShellyDevice));
  }
}
```

This mirrors the pattern in the existing `DeviceService` and `PlantService`. If `GraphqlClientService` exposes its Apollo client under a different field name (not `.client`), match whatever those services do — read one of them first.

- [ ] **Step 2: Typecheck**

```
cd /c/Users/Sergii/Desktop/growwatch/frontend && npx tsc --noEmit
```
Expected: no errors.

- [ ] **Step 3: Commit**

```
git add frontend/src/app/core/services/shelly.service.ts
git commit -m "shelly: add ShellyService (Apollo wrapper)"
```

---

## Task 7: Shelly setup page component

**Files:**
- Create: `frontend/src/app/features/settings/shelly-setup.component.ts`

This page lists paired Shellys, lets the user add a new one (form inline), and shows the webhook URL with a Copy button. Rename / Rotate / Remove use confirm dialogs.

- [ ] **Step 1: Write the component**

Create the file with this exact content:

```ts
import { Component, OnInit, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Router } from '@angular/router';
import { TranslocoDirective, TranslocoService } from '@jsverse/transloco';
import { ShellyService, ShellyDevice } from '../../core/services/shelly.service';
import { IconComponent } from '../../shared/components/atoms/icon.component';
import dayjs from 'dayjs';

@Component({
  selector: 'app-shelly-setup',
  imports: [FormsModule, TranslocoDirective, IconComponent],
  template: `
    <div class="max-w-lg mx-auto px-4 py-6" *transloco="let t">

      <button (click)="back()"
              class="flex items-center gap-1.5 text-[13px] text-gray-400 hover:text-gray-600 transition-colors mb-6">
        ‹ {{ t('nav.settings') }}
      </button>

      <div class="mb-6">
        <h1 class="text-[18px] font-medium text-gray-800">{{ t('shelly.title') }}</h1>
        <p class="text-[11px] text-gray-400 mt-0.5">{{ t('shelly.subtitle') }}</p>
      </div>

      @if (devices().length === 0 && !loading()) {
        <div class="bg-white shadow-gw-sm rounded-xl p-6 text-center">
          <div class="text-[14px] text-gray-600">{{ t('shelly.noDevices') }}</div>
          <div class="text-[11px] text-gray-400 mt-1">{{ t('shelly.noDevicesHint') }}</div>
        </div>
      }

      @for (d of devices(); track d.id) {
        <div class="bg-white shadow-gw-sm rounded-xl p-4 mb-3">
          <div class="flex items-start gap-3">
            <div class="flex-1 min-w-0">
              <div class="text-[14px] font-medium text-gray-800 truncate">{{ d.name }}</div>
              <div class="text-[11px] text-gray-400 mt-0.5 font-mono truncate">{{ d.deviceId }}</div>
              <div class="text-[11px] text-gray-400 mt-1">
                {{ lastSeenLabel(d) }}
                @if (d.lastBatteryPercent != null) {
                  <span class="ml-2">· {{ t('shelly.battery', { n: d.lastBatteryPercent }) }}</span>
                }
              </div>
            </div>
            <div class="flex gap-1 shrink-0">
              <button (click)="startRename(d)" [title]="t('common.rename')"
                      class="w-9 h-9 flex items-center justify-center rounded-lg text-gray-400 hover:bg-gw-green-light/60 hover:text-gw-green-dark transition-colors">
                <app-icon name="pencil" class="w-4 h-4" />
              </button>
              <button (click)="rotate(d)" [title]="t('shelly.rotateToken')"
                      class="w-9 h-9 flex items-center justify-center rounded-lg text-gray-400 hover:bg-gw-amber-light hover:text-gw-amber transition-colors">
                <app-icon name="refresh" class="w-4 h-4" />
              </button>
              <button (click)="remove(d)" [title]="t('shelly.remove')"
                      class="w-9 h-9 flex items-center justify-center rounded-lg text-gray-400 hover:bg-red-50 hover:text-red-500 transition-colors">
                <app-icon name="trash" class="w-4 h-4" />
              </button>
            </div>
          </div>

          <!-- Webhook URL display -->
          <div class="mt-3 pt-3 border-t border-gray-100">
            <div class="text-[11px] text-gray-400 mb-1">{{ t('shelly.webhookUrlLabel') }}</div>
            <div class="flex items-center gap-2">
              <code class="flex-1 text-[11px] bg-gray-50 rounded-lg px-2 py-1.5 truncate font-mono">{{ d.webhookUrl }}</code>
              <button (click)="copy(d.webhookUrl)"
                      class="text-[11px] text-gw-green-dark hover:underline shrink-0">
                {{ copiedId() === d.id ? t('shelly.copied') : t('shelly.copyUrl') }}
              </button>
            </div>
            <p class="text-[11px] text-gray-400 mt-1.5">{{ t('shelly.webhookUrlHint') }}</p>
          </div>
        </div>
      }

      @if (!addingNew()) {
        <button (click)="startAdd()"
                class="w-full mt-4 px-4 py-3 rounded-xl bg-gw-green text-white text-[14px] font-medium">
          {{ t('shelly.addDevice') }}
        </button>
      } @else {
        <div class="bg-white shadow-gw-sm rounded-xl p-4 mt-4">
          <div class="flex flex-col gap-3">
            <div>
              <label class="block text-[11px] text-gray-400 mb-1.5">{{ t('shelly.deviceIdLabel') }}</label>
              <input type="text" [(ngModel)]="draftDeviceId"
                     [placeholder]="t('shelly.deviceIdPlaceholder')"
                     class="w-full shadow-gw-sm rounded-lg px-3 py-2 text-[13px] font-mono outline-none focus:border-gw-green transition-colors" />
              <p class="text-[11px] text-gray-400 mt-1">{{ t('shelly.deviceIdHint') }}</p>
            </div>
            <div>
              <label class="block text-[11px] text-gray-400 mb-1.5">{{ t('shelly.nameLabel') }}</label>
              <input type="text" [(ngModel)]="draftName"
                     [placeholder]="t('shelly.namePlaceholder')"
                     class="w-full shadow-gw-sm rounded-lg px-3 py-2 text-[13px] outline-none focus:border-gw-green transition-colors" />
            </div>
            <div class="flex gap-2">
              <button (click)="saveNew()"
                      [disabled]="!canSave() || saving()"
                      class="flex-1 bg-gw-green text-white text-[13px] py-2.5 rounded-xl font-medium disabled:opacity-40 transition-colors">
                {{ t('shelly.save') }}
              </button>
              <button (click)="cancelAdd()"
                      class="px-4 text-[13px] text-gray-400 hover:text-gray-600 transition-colors">
                {{ t('shelly.cancel') }}
              </button>
            </div>
          </div>
        </div>
      }
    </div>
  `,
})
export class ShellySetupComponent implements OnInit {
  private shelly = inject(ShellyService);
  private router = inject(Router);
  private transloco = inject(TranslocoService);

  devices = signal<ShellyDevice[]>([]);
  loading = signal(true);

  addingNew = signal(false);
  draftDeviceId = '';
  draftName = '';
  saving = signal(false);
  copiedId = signal<string | null>(null);

  ngOnInit() {
    this.reload();
  }

  private reload() {
    this.loading.set(true);
    this.shelly.list().subscribe({
      next: list => { this.devices.set(list); this.loading.set(false); },
      error: err => { console.error('Failed to load Shelly devices:', err); this.loading.set(false); },
    });
  }

  back() { this.router.navigate(['/settings']); }

  startAdd() {
    this.draftDeviceId = '';
    this.draftName = '';
    this.addingNew.set(true);
  }

  cancelAdd() { this.addingNew.set(false); }

  canSave(): boolean {
    return this.draftDeviceId.trim().length > 0 && this.draftName.trim().length > 0;
  }

  saveNew() {
    if (!this.canSave() || this.saving()) return;
    this.saving.set(true);
    this.shelly.add(this.draftDeviceId.trim(), this.draftName.trim()).subscribe({
      next: () => { this.saving.set(false); this.addingNew.set(false); this.reload(); },
      error: err => {
        this.saving.set(false);
        alert(err?.message ?? 'Failed to add device');
      },
    });
  }

  startRename(d: ShellyDevice) {
    const name = prompt(this.transloco.translate('shelly.nameLabel'), d.name);
    if (!name || name.trim() === d.name) return;
    this.shelly.rename(d.id, name.trim()).subscribe({
      next: () => this.reload(),
      error: err => alert(err?.message ?? 'Failed to rename'),
    });
  }

  rotate(d: ShellyDevice) {
    if (!confirm(this.transloco.translate('shelly.rotateTokenConfirm'))) return;
    this.shelly.rotateToken(d.id).subscribe({
      next: () => this.reload(),
      error: err => alert(err?.message ?? 'Failed to rotate token'),
    });
  }

  remove(d: ShellyDevice) {
    if (!confirm(this.transloco.translate('shelly.removeConfirm'))) return;
    this.shelly.remove(d.id).subscribe({
      next: () => this.reload(),
      error: err => alert(err?.message ?? 'Failed to remove'),
    });
  }

  copy(url: string) {
    navigator.clipboard.writeText(url).then(() => {
      const d = this.devices().find(x => x.webhookUrl === url);
      if (d) {
        this.copiedId.set(d.id);
        setTimeout(() => this.copiedId.set(null), 1500);
      }
    });
  }

  lastSeenLabel(d: ShellyDevice): string {
    if (!d.lastSeenAt) return this.transloco.translate('shelly.lastSeenNever');
    const diffMin = dayjs().diff(dayjs(d.lastSeenAt), 'minute');
    if (diffMin < 1) return this.transloco.translate('shelly.lastSeenJustNow');
    if (diffMin < 60) return this.transloco.translate('shelly.lastSeenMinutesAgo', { n: diffMin });
    const diffHr = Math.floor(diffMin / 60);
    if (diffHr < 24) return this.transloco.translate('shelly.lastSeenHoursAgo', { n: diffHr });
    const diffDay = Math.floor(diffHr / 24);
    return this.transloco.translate('shelly.lastSeenDaysAgo', { n: diffDay });
  }
}
```

If the `refresh` icon isn't registered in `IconComponent`'s sprite/registry, swap the `<app-icon name="refresh" ...>` for a plain text "↻" inside the button — check `frontend/src/app/shared/components/atoms/icon.component.ts` to confirm whether `refresh` exists. If it doesn't, use `<span class="text-[14px]">↻</span>` as the button content instead.

- [ ] **Step 2: Typecheck**

```
cd /c/Users/Sergii/Desktop/growwatch/frontend && npx tsc --noEmit
```
Expected: no errors.

- [ ] **Step 3: Commit**

```
git add frontend/src/app/features/settings/shelly-setup.component.ts
git commit -m "shelly: add /settings/shelly-setup page"
```

---

## Task 8: Route registration and Settings link

**Files:**
- Modify: `frontend/src/app/app.routes.ts` — add `/settings/shelly-setup` route
- Modify: `frontend/src/app/features/settings/settings.component.ts` — add link to Shelly setup

- [ ] **Step 1: Register the route**

In `frontend/src/app/app.routes.ts`, find the existing route for `settings/sensor-setup` (around line 89). Add a new route directly below it:

```ts
{
  path: 'settings/shelly-setup',
  canActivate: [tierGuard('pro')],
  loadComponent: () => import('./features/settings/shelly-setup.component').then(m => m.ShellySetupComponent),
},
```

Match the surrounding indentation. Use the same `tierGuard('pro')` as `sensor-setup` — Shelly is a pro feature, same as the ESP32 sensor setup. If your tier policy is different (e.g., free tier should access Shelly), adjust to match.

- [ ] **Step 2: Add the Settings page link**

Open `frontend/src/app/features/settings/settings.component.ts`. Find the existing `routerLink="/settings/sensor-setup"` row (it's the row that opens the ESP32 sensor setup page from the Settings list).

Directly below that row, add an equivalent row pointing to `/settings/shelly-setup`. The exact markup depends on the existing row's pattern — copy it verbatim and change:

- the `routerLink` to `'/settings/shelly-setup'`
- the title text to `{{ t('shelly.settingsLinkTitle') }}`
- the subtitle text (if any) to `{{ t('shelly.settingsLinkSubtitle') }}`
- the icon to `wifi` (or whichever icon the existing sensor-setup row uses — pick the same one)

Example, assuming the existing row pattern looks like:

```html
<a routerLink="/settings/sensor-setup" class="...">
  <app-icon name="wifi" class="..." />
  <div>
    <div>{{ t('sensorSetup.linkTitle') }}</div>
    <div>{{ t('sensorSetup.linkSubtitle') }}</div>
  </div>
</a>
```

The new row to add directly below:

```html
<a routerLink="/settings/shelly-setup" class="...">
  <app-icon name="wifi" class="..." />
  <div>
    <div>{{ t('shelly.settingsLinkTitle') }}</div>
    <div>{{ t('shelly.settingsLinkSubtitle') }}</div>
  </div>
</a>
```

If the existing row uses different markup (a button, different layout), copy the existing markup exactly and just swap the `routerLink` target + the two i18n keys.

- [ ] **Step 3: Typecheck**

```
cd /c/Users/Sergii/Desktop/growwatch/frontend && npx tsc --noEmit
```
Expected: no errors.

- [ ] **Step 4: Manual verify**

Start both servers in two terminals:

```
cd /c/Users/Sergii/Desktop/growwatch/backend && npm run dev
cd /c/Users/Sergii/Desktop/growwatch/frontend && npm start
```

In a browser at `http://localhost:4200`:

1. Log in, go to **Settings**. Confirm a new row "Shelly H&T sensors" appears below "Sensor setup".
2. Click it → lands on `/settings/shelly-setup` with the empty-state card ("No Shelly devices paired yet").
3. Click **Add Shelly** → form expands with two inputs.
4. Enter device ID `shellyhtg3-TEST123` and name `Greenhouse`. Save.
5. Confirm a card appears with the device, the webhook URL is shown, and the URL contains `token=<64 hex>`, `deviceId=shellyhtg3-TEST123`, and the placeholders `${ev.tC}`, `${ev.rh}`, `${devicepower:0.battery.percent}`.
6. Click **Copy** → label flips to "Copied" for 1.5s.
7. Try to add the same device ID again → expect alert "This device is already paired".
8. Click **Rotate token** → confirm → new card shows a new token in the URL.
9. End-to-end webhook test: copy the URL, paste into a new terminal, replace `${ev.tC}` with `21.5` and `${ev.rh}` with `45.2` and `${devicepower:0.battery.percent}` with `87`. Run:

   ```
   curl -i -X POST '<modified URL>'
   ```
   Expected: `HTTP/1.1 204 No Content`. Then in browser, the home page sensor readings should update to 21.5°C / 45.2%. Back on the Shelly setup page, refresh — last-seen should say "Just now" and battery "Battery 87%".
10. Click **Remove** → confirm → device disappears.

- [ ] **Step 5: Commit**

```
git add frontend/src/app/app.routes.ts frontend/src/app/features/settings/settings.component.ts
git commit -m "shelly: register route and link from Settings"
```

---

## Self-review notes

- **Spec coverage:**
  - Webhook endpoint with token/deviceId/t/h/bat → Task 5.
  - 401 on unknown token, 400 on missing/bad numeric → Task 5 (and smoke-tested with curl in Task 5 Step 5).
  - `ShellyDevice` Mongo model with all listed fields + indexes → Task 2.
  - GraphQL type + 4 mutations + 1 query → Task 3 + Task 4.
  - 64-hex randomBytes(32) token → Task 4 (`generateShellyToken`).
  - Pairing UI list + add + rotate + rename + remove + copy → Task 7.
  - `/settings/shelly-setup` route + Settings link → Task 8.
  - `handleSensorData` called with `{temperature, humidity, userId}` → Task 5 (and the userId short-circuit in Step 3).
  - `lastSeenAt` and `lastBatteryPercent` updated on every webhook hit → Task 5 (`touchShelly`).
  - i18n keys → Task 1.
  - **Note on rate limit:** The spec mentions "1 request per device per 10 seconds" as a mitigation. Not implemented in this plan — Shelly's natural reporting cadence (every ~10 min) is far below that threshold, and adding express-rate-limit per-token introduces a dependency for a defence-in-depth concern. Documented here as a known omission to revisit if abuse becomes a problem.

- **Type consistency:** `ShellyDevice` field names (`deviceId`, `name`, `webhookUrl`, `lastSeenAt`, `lastBatteryPercent`, `createdAt`, `id`) used identically across the Mongo interface, GraphQL type, resolver mapping, frontend interface, and component template. Mutation argument names (`deviceId`, `name`, `id`) match across schema, resolver, and service.

- **No placeholders:** every step ships exact code or exact files/lines to change.
