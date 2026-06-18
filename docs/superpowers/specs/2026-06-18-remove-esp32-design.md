# Remove the ESP32 Device Subsystem — Design

**Date:** 2026-06-18
**Status:** Approved for planning
**Context:** Shelly Cloud is now the sensor source (see `2026-06-17-shelly-cloud-integration-design.md`). The ESP32 ingestion path and its device-management UI are obsolete and should be removed end-to-end.

## Problem

GrowWatch began with an ESP32 that POSTs readings to `/api/sensor-data`, plus a
`Device` model and a pairing/claim flow to bind a device to a user. That whole
subsystem is now redundant: Shelly Cloud feeds the same `handleSensorData`
pipeline, and the dashboard reads from it regardless of source. Keeping the ESP32
code around is dead weight and clutters the settings page with options
(My Devices, Sensor Setup Guide) that no longer apply.

## Goal

Remove the ESP32 / `Device` subsystem end-to-end. Shelly Cloud becomes the sole
sensor source. The shared downstream pipeline (in-memory live store, hourly
aggregation, GraphQL `sensorData`/`hourlySensorData` queries + subscription,
dashboard) is **unchanged**.

## Non-goals

- No change to the Shelly Cloud integration or the shared sensor pipeline.
- No change to the dashboard/home UI beyond it naturally having one source.
- No data migration. Existing `HourlySensorData` history is retained.
- Plant `monitored` flags are unrelated to devices and are untouched.

## Key fact (verified during brainstorming)

The home dashboard does **not** depend on the `Device` system — every
`monitored` reference in home/alerts/digest/plant-detail is about **plants**.
`DeviceService` is consumed only by the `/settings/devices` page. So removing the
subsystem cannot break the dashboard.

## Scope — what is removed

### Backend

**`backend/src/index.ts`**
- Delete the `POST /api/sensor-data` route handler (ESP32 ingest).
- Delete the `POST /api/save-hourly` route handler (manual hourly trigger).

**`backend/src/models.ts`**
- Delete the `Device` model and `IDevice` interface.

**`backend/src/resolvers.ts`**
- Remove device-claim machinery: `pendingClaims` map, `openClaim`/`cancelClaim`/
  `activeClaimants` helpers, `setSuperuserId`/`superuserId` **if** they become
  unused after `/api/save-hourly` removal (see "Open items"), `resolveDeviceOwner`,
  `mapDevice`.
- **Simplify `handleSensorData`**: keep only the path where `data.userId` is
  provided (the Shelly poller's call shape `{ deviceId, temperature, humidity,
  userId }`). Drop the `resolveDeviceOwner(data.deviceId)` fallback and the
  unknown-device claim branch. If `userId` is absent, reject. Everything after
  ownership resolution (sanitize, `pushReading`, `hourAccum`, `pubsub.publish`,
  `upsertCurrentHour`) is unchanged.
- Remove resolvers: `myDevices`, `deviceCount` (field resolver on `User`),
  `openDeviceClaim`, `cancelDeviceClaim`, `renameDevice`, `removeDevice`, and the
  `deviceClaimed` subscription resolver.
- Remove `Device.deleteMany` from `cascadeDeleteUser`.
- Remove `Device.find` and the `devices` key from `exportUserData`.

**`backend/src/schema.ts`**
- Remove the `Device` type; the `myDevices` and `deviceCount` query fields; the
  `openDeviceClaim`/`cancelDeviceClaim`/`renameDevice`/`removeDevice` mutations;
  the `deviceClaimed` subscription. The `deviceCount` field on `User` is removed.
- Keep `SensorData`/`HourlySensorData` and their `deviceId` field (Shelly uses it).

**`backend/src/pubsub.ts` / `backend/src/types.ts`**
- Remove the `deviceClaimed` channel helper and any `Device`-only types left
  unused after the above.

### Frontend

**Routes** (`app.routes.ts`) — remove `/settings/sensor-setup` and
`/settings/devices`.

**Delete components/services**
- `frontend/src/app/features/settings/sensor-setup.component.ts`
- `frontend/src/app/features/settings/devices.component.ts`
- `frontend/src/app/core/services/device.service.ts`

**`settings.component.ts`** — remove the "My Devices" and "Sensor Setup Guide"
buttons and their `openDevices()` / `openSensorSetup()` handlers. Keep the Shelly
entry. The "Setup" section then contains only the Shelly link.

**Admin** — remove the `deviceCount` column from `admin.component.ts` and the
`deviceCount` field from `admin.service.ts` (`USER_FIELDS` + the `AdminUser`
interface), since it counted ESP32 devices.

**i18n (`en.json` + `da.json`)** — remove now-orphaned keys: `settings.myDevices`,
`settings.myDevicesDescription`, `settings.sensorSetupGuide`,
`settings.sensorSetupGuideDescription`, `admin.devicesHeader`, and any
device/claim/sensor-setup-specific strings under their components. Keep
`settings.setup` (still used as the Shelly section header) and Shelly keys.

## Open items the plan must resolve (not guesses)

1. **`saveHourlyData` / `superuserId`:** confirm whether anything other than
   `/api/save-hourly` calls `saveHourlyData`. If the only caller is the removed
   route, delete `saveHourlyData`, `superuserId`, and `setSuperuserId`. If an
   hourly cron also calls it, keep it but drop the `superuserId` fallback only if
   safe.
2. **Exact orphaned i18n keys:** the plan enumerates them by reading the current
   files, not from memory.
3. **`types.ts`/`pubsub.ts` device entries:** remove only those left unused; the
   plan greps to confirm.

## Error handling / behavior changes

- `handleSensorData` now requires `userId`; a call without it is rejected with a
  log line (the ESP32's unknown-device/claim path no longer exists). The Shelly
  poller always supplies `userId`, so live ingestion is unaffected.
- A user with no Shelly linked sees the existing empty dashboard state.

## Verification

- Backend `npx tsc --noEmit` clean.
- Frontend `npx tsc -p tsconfig.app.json --noEmit` clean (strict templates).
- Both i18n files valid JSON.
- Grep shows no dangling references to `Device`/`mapDevice`/`resolveDeviceOwner`/
  `openDeviceClaim`/`deviceClaimed`/`/api/sensor-data`/`/api/save-hourly`/
  `device.service`/`sensor-setup`/`devices.component` in `src`.
- Manual smoke: app builds, settings shows only the Shelly setup entry, admin
  user list renders without the device column, dashboard still shows Shelly data.
