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
Backend URL is hardcoded in [frontend/src/app/core/services/sensor.service.ts](frontend/src/app/core/services/sensor.service.ts) as `localhost:4000`.

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
- [backend/src/schema.ts](backend/src/schema.ts) — GraphQL type definitions (`SensorData`, `HourlySensorData`, subscription)
- [backend/src/resolvers.ts](backend/src/resolvers.ts) — in-memory store, `handleSensorData()`, hourly aggregation cron, GraphQL resolvers
- [backend/src/lightUtils.ts](backend/src/lightUtils.ts) — plant light range table (`PLANT_LIGHT_RANGES`), `getLightStatus()`, `calculateDailyLightAccumulation()`
- [backend/src/models.ts](backend/src/models.ts) — Mongoose schema for `HourlySensorData`
- [backend/src/db.ts](backend/src/db.ts) — MongoDB connection

**Key constraint**: `lightStatus` is computed on the fly by the `SensorData` and `HourlySensorData` GraphQL resolvers by calling `getLightStatus()`. The plant type is currently hardcoded to `'tomato'` in both resolver field resolvers.

**In-memory vs. persistent**: Live readings are in-memory only (last 100 kept, last 10 returned by `sensorData` query). Only hourly aggregates go to MongoDB. Restarting the server loses all live readings.

### Frontend structure
Angular 21 standalone components, no NgModules. Tailwind CSS v4 for styling.

- [frontend/src/app/app.routes.ts](frontend/src/app/app.routes.ts) — lazy-loaded routes: `/` Home, `/plants`, `/digest`, `/alerts`, `/settings`
- [frontend/src/app/shared/components/shell/shell.component.ts](frontend/src/app/shared/components/shell/shell.component.ts) — layout shell: desktop sidebar + mobile bottom nav
- [frontend/src/app/core/services/sensor.service.ts](frontend/src/app/core/services/sensor.service.ts) — Apollo Client setup (HTTP + WS split link), all GraphQL queries/subscription, `getMood()` logic
- [frontend/src/app/core/services/plant.service.ts](frontend/src/app/core/services/plant.service.ts) — plant list persisted to `localStorage` as `growwatch-plants`, exposed as an Angular signal
- [frontend/src/app/features/home/home.component.ts](frontend/src/app/features/home/home.component.ts) — main dashboard; uses Angular `signal` + `computed` throughout; subscribes to live sensor data via `SensorService`

**Signal pattern**: Components use `inject()` + `signal()`/`computed()` rather than constructor injection + Observables where possible. `SensorService` returns `Observable`s (wrapping Apollo promises) which `HomeComponent` subscribes to and stores in signals.

**Sensors in schema vs. reality**: The frontend `SensorData` interface has optional `temperature`, `humidity`, `co2`, `pressure` fields, and the home dashboard already renders them as "coming soon" metrics — but the backend `ESP32Message` type and GraphQL schema only define `lightLevel`. These fields will need to be added to the schema and `ESP32Message` when the hardware supports them.
