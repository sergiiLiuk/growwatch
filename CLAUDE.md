# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

GrowWatch is a smart greenhouse monitoring system. An ESP32 microcontroller POSTs sensor readings to the backend, which stores them in-memory and persists hourly aggregates to MongoDB. The Angular frontend connects via GraphQL (HTTP for queries, WebSocket for real-time subscriptions).

## Commands

### Backend (`cd backend`)
```
npm run dev       # Run with ts-node (development)
npm run build     # Compile TypeScript → dist/
npm start         # Run compiled output
```
Requires MongoDB. Connection URI defaults to `mongodb://localhost:27017/smart-greenhouse` or `MONGODB_URI` env var (via `.env` file, loaded with dotenv).

### Frontend (`cd frontend`)
```
npm start         # ng serve — dev server at localhost:4200
npm run build     # Production build
npm test          # vitest
```
Backend URL is configured per environment in [frontend/src/environments/](frontend/src/environments/): HTTP via the `/api` proxy (see `proxy.conf.json`), WS direct to `ws://localhost:4000/graphql` in dev. Production URLs are generated at build time by `scripts/set-env.js` from the `BACKEND_URL` env var. Apollo Client + split link live in [frontend/src/app/core/services/graphql-client.service.ts](frontend/src/app/core/services/graphql-client.service.ts).

### Testing the ESP32 endpoint manually
```
POST http://localhost:4000/api/sensor-data
Content-Type: application/json
{"lightLevel": 25000}
```
Force an hourly save: `POST http://localhost:4000/api/save-hourly`

## Architecture

### Data flow
```
ESP32 → POST /api/sensor-data
       → handleSensorData() (resolvers.ts)
       → in-memory sensorDataStore (last 100 readings)
       → pubsub.publish() → GraphQL subscription push
       → hourly aggregation → MongoDB (HourlySensorData collection)
                                        ↓
                             Angular queries via GraphQL HTTP
                             Angular subscribes via GraphQL WS
```

### Backend structure
- [backend/src/index.ts](backend/src/index.ts) — Express + Apollo Server setup, HTTP server, WebSocket server, ESP32 REST endpoint
- [backend/src/schema.ts](backend/src/schema.ts) — GraphQL type definitions (`SensorData`, `HourlySensorData`, `Plant`, queries, mutations, subscription)
- [backend/src/resolvers.ts](backend/src/resolvers.ts) — in-memory store, `handleSensorData()`, hourly aggregation cron, GraphQL resolvers (sensor + plant)
- [backend/src/lightUtils.ts](backend/src/lightUtils.ts) — plant light range table (`PLANT_LIGHT_RANGES`), `getLightStatus()`, `calculateDailyLightAccumulation()`
- [backend/src/models.ts](backend/src/models.ts) — Mongoose schemas for `HourlySensorData` and `Plant`
- [backend/src/db.ts](backend/src/db.ts) — MongoDB connection

**Key constraint**: `lightStatus` is computed on the fly by the `SensorData` and `HourlySensorData` GraphQL resolvers by calling `getLightStatus()`. The plant type used comes from a cached `primaryPlantType` (the earliest-created plant in DB), refreshed on every plant mutation via `refreshPrimaryPlant()`.

**In-memory vs. persistent**: Live readings are in-memory only (last 100 kept, last 10 returned by `sensorData` query). Only hourly aggregates go to MongoDB. Restarting the server loses all live readings.

### Frontend structure
Angular 21 standalone components, no NgModules. Tailwind CSS v4 for styling.

- [frontend/src/app/app.routes.ts](frontend/src/app/app.routes.ts) — lazy-loaded routes: `/login` (outside shell), `/` Home, `/plants`, `/plants/:id`, `/light`, `/digest`, `/alerts`, `/settings`, `/settings/sensor-setup`
- [frontend/src/app/shared/components/shell/shell.component.ts](frontend/src/app/shared/components/shell/shell.component.ts) — layout shell: desktop sidebar + mobile bottom nav (wraps all non-login routes)
- [frontend/src/app/core/services/graphql-client.service.ts](frontend/src/app/core/services/graphql-client.service.ts) — Apollo Client setup (HTTP + WS split link), shared by all services
- [frontend/src/app/core/services/sensor.service.ts](frontend/src/app/core/services/sensor.service.ts) — sensor GraphQL queries/subscription, `getMood()` logic, `PLANT_LIGHT_RANGES`
- [frontend/src/app/core/services/plant.service.ts](frontend/src/app/core/services/plant.service.ts) — plants loaded from MongoDB via GraphQL on construction, exposed as an Angular signal; mutations (add/update/remove/setMonitored) round-trip through GraphQL
- [frontend/src/app/core/services/auth.service.ts](frontend/src/app/core/services/auth.service.ts) — stub auth that persists the signed-in email to `localStorage`. No backend mutation, no JWT, no per-user filtering on the API.
- [frontend/src/app/features/home/home.component.ts](frontend/src/app/features/home/home.component.ts) — main dashboard; uses Angular `signal` + `computed` throughout; subscribes to live sensor data via `SensorService`

**Signal pattern**: Components use `inject()` + `signal()`/`computed()` rather than constructor injection + Observables where possible. Services return `Observable`s (wrapping Apollo promises) which components subscribe to and store in signals.

**`localStorage` usage** (everything else lives in MongoDB):
- `growwatch-user` — stub auth user (just email)
- `growwatch-location` — saved weather location
- `growwatch-alerts-read` — alerts read history
- `growwatch-settings` — UI preferences

**BME688 sensor fields**: `temperature`, `humidity`, `pressure`, `co2` are all wired end-to-end — ESP32 firmware → `ESP32Message` → in-memory store → GraphQL schema → frontend. All fields are optional and only emitted when the BME688 reports them.
