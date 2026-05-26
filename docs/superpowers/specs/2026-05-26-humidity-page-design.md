# Humidity Insights Page — Design

**Date:** 2026-05-26
**Status:** Approved for implementation

## Goal

Add a dedicated `/humidity` page that mirrors the existing `/temperature` insights page, plus user-configurable humidity range in Settings. The home dashboard's humidity sensor card becomes a link to the new page, and the home "mood" reading uses the same configurable range so values stay consistent across the app.

## Background

- The home dashboard already shows live humidity as a sensor card ([home.component.ts:115-122](frontend/src/app/features/home/home.component.ts#L115-L122)) but has no detail page behind it.
- BME688 data already flows end-to-end: `humidity` / `avgHumidity` / `minHumidity` / `maxHumidity` are in the GraphQL schema and exposed via [sensor.service.ts](frontend/src/app/core/services/sensor.service.ts).
- `getMood()` currently hardcodes `humidity >= 40 && humidity <= 80` ([sensor.service.ts:215](frontend/src/app/core/services/sensor.service.ts#L215)). This will move to user settings.
- Reference pattern: [temperature-insights.component.ts](frontend/src/app/features/temperature/temperature-insights.component.ts) is the template. Its structure (live card → today's range card → week history chart with min/max bars, avg tick, optimal range lines, week navigation, weekly summary + extremes) is reused.

## Default Range

`40%–80%` RH — broad enough to cover seedlings through fruiting for the supported crops. Users can tighten per their stage/crop in Settings. Common practice:
- Seedlings/propagation: 75–90%
- Vegetative: 60–70%
- Flowering/fruiting: 50–60%
- Hard limits: <40% (growth stalls) / >85% (fungal disease risk)

## Scope

### 1. UserSettings — humidity range
- **Backend** ([backend/src/models.ts](backend/src/models.ts) `UserSettings` schema): add `humidityMin: Number` (default `40`) and `humidityMax: Number` (default `80`).
- **GraphQL schema** ([backend/src/schema.ts](backend/src/schema.ts)): expose `humidityMin` / `humidityMax` on the `UserSettings` type and `UpdateUserSettingsInput`.
- **Resolver** ([backend/src/resolvers.ts](backend/src/resolvers.ts)): wire the new fields through the `updateUserSettings` mutation, parallel to the existing temp range handling.
- **Frontend service** ([frontend/src/app/core/services/user-settings.service.ts](frontend/src/app/core/services/user-settings.service.ts)): add `effectiveHumidityMin()` / `effectiveHumidityMax()` computed getters with the same default-fallback shape as the temp range; extend the GraphQL fragments to fetch/save the new fields.

### 2. Settings page — humidity range section
- Add a "Humidity range" section to [settings.component.ts](frontend/src/app/features/settings/settings.component.ts) mirroring the existing temperature range UI:
  - Two number inputs (min / max), unit `%`
  - Validation: 0 ≤ min < max ≤ 100
  - Save via the same `updateUserSettings` flow already used for temp range
- i18n keys: `settings.humidityRange`, `settings.humidityRangeHint`, `settings.minHumidity`, `settings.maxHumidity`.

### 3. New `/humidity` route + component
- **Route** ([app.routes.ts](frontend/src/app/app.routes.ts)): lazy-loaded `/humidity` → `HumidityInsightsComponent`, parallel to `/temperature` and `/light`.
- **Component**: `frontend/src/app/features/humidity/humidity-insights.component.ts`, structurally a copy of `TemperatureInsightsComponent` with these material differences:
  - Reads `data.humidity` / `h.avgHumidity` / `h.minHumidity` / `h.maxHumidity` (instead of temperature fields).
  - Unit `%` (instead of `°C`); formatter shows whole-percent or one decimal — match temp's `.toFixed(1)` for consistency.
  - Optimal range thresholds come from `userSettings.effectiveHumidityMin()` / `effectiveHumidityMax()`.
  - **Y-axis is fixed `0–100`** — no dynamic max scaling (humidity is naturally bounded). `yAxisLabels` returns `{ top: '100', mid: '50' }`. `chartYMax` constant `100`.
  - Bar coloring scheme unchanged from temp:
    - green: day's min/max within optimal
    - amber: range straddles a limit, but avg still inside
    - red: avg outside optimal
  - Badge labels: `tooDry` / `optimal` / `tooHumid`.
  - Sub-label / tooltip: `belowHumidityFloor` / `aboveHumidityCeiling` / `withinHumidityRange`.
  - Week extremes: `driest` / `wettest` (parallel to `coldest` / `hottest`).
  - Empty-state icon: 💧 (instead of 🌡️).
- **Card structure preserved**: Live reading → Today's range → Week history. Same skeleton heights, same back button, same week navigation (`weekOffset` signal, `prevWeek` / `nextWeek` with -12 lower bound).

### 4. Home sensor card — link to page
- Add `link="/humidity"` to the humidity `<app-sensor-card>` in [home.component.ts:115-122](frontend/src/app/features/home/home.component.ts#L115-L122).
- No other changes to the home card; existing `humidValue()`, `humidStatus()`, `humidSpark()`, `humidRange()` computeds already drive it. (`humidRange()` should be updated to read from `userSettings.effectiveHumidityMin/Max()` instead of any hardcoded constants if it currently uses them.)

### 5. `sensor.service.ts` `getMood()` — use configurable range
- Replace ([sensor.service.ts:215](frontend/src/app/core/services/sensor.service.ts#L215)):
  ```ts
  const humidityOk = data.humidity == null || (data.humidity >= 40 && data.humidity <= 80);
  ```
  with:
  ```ts
  const humidityOk = data.humidity == null
    || (data.humidity >= this.userSettings.effectiveHumidityMin()
        && data.humidity <= this.userSettings.effectiveHumidityMax());
  ```
- Ensures the home mood, the humidity card status, and the humidity insights badge all agree on what "optimal" means.

### 6. i18n — en.json + da.json
Add to both files:
- `insights.humidityTitle`, `insights.humiditySubtitle`
- `insights.tooDry`, `insights.tooHumid`
- `insights.belowHumidityFloor` (params: `{min}`), `insights.aboveHumidityCeiling` (params: `{max}`), `insights.withinHumidityRange` (params: `{min, max}`)
- `insights.driest`, `insights.wettest`
- `settings.humidityRange`, `settings.humidityRangeHint`, `settings.minHumidity`, `settings.maxHumidity`

The existing `insights.optimal`, `insights.liveReading`, `insights.today`, `insights.weekHistory`, `insights.weekAvg`, `insights.hourLogged`, `insights.hoursLogged`, `insights.noHourlyData`, `insights.hourlySnapshotsHint`, `insights.noWeekData`, `insights.noWeekDataHint`, `insights.updated`, `insights.justNow`, `insights.secondsAgo`, `insights.minutesAgo`, `insights.dayTooltip`, `insights.upcoming`, `insights.noData` are reused as-is.

## Out of Scope

- No new GraphQL fields — all humidity data already flows through the existing queries.
- No backend humidity-specific logic (no equivalent of `getLightStatus()` is needed; humidity status is computed inline on the frontend from the user range, same as temperature).
- No alert/notification work — alerts already key off the mood, so they pick up the new range automatically once `getMood()` is updated.
- No VPD (Vapor Pressure Deficit) calculation. Possibly a future feature; explicitly not in this design.
- No stage-aware ranges (seedling / veg / flower presets). Single range per user for now.

## Testing

Manual verification (no automated tests for the existing temperature page — match that baseline):
- `/humidity` route renders, live card updates on new readings.
- Today's range card shows correct avg/min/max from hourly aggregates.
- Week chart renders 7 bars, prev/next navigation respects `-12 ≤ offset ≤ 0`.
- Updating humidity range in Settings re-colors bars and changes badge label without reload (signal-driven).
- Danish locale: every visible string is translated; switching language reactively updates the page.
- Home humidity card click navigates to `/humidity`.
- Home mood transitions correctly when humidity crosses the new configurable thresholds.

## Files Touched

**Backend:**
- `backend/src/models.ts` — `UserSettings` schema
- `backend/src/schema.ts` — `UserSettings` GraphQL type + input
- `backend/src/resolvers.ts` — `updateUserSettings` resolver

**Frontend:**
- `frontend/src/app/core/services/user-settings.service.ts` — new effective getters + GraphQL fragments
- `frontend/src/app/core/services/sensor.service.ts` — `getMood()` humidity check
- `frontend/src/app/features/settings/settings.component.ts` — humidity range section
- `frontend/src/app/features/home/home.component.ts` — `link="/humidity"` (+ `humidRange()` source if hardcoded)
- `frontend/src/app/features/humidity/humidity-insights.component.ts` — **new file**
- `frontend/src/app/app.routes.ts` — `/humidity` route
- `frontend/public/i18n/en.json` — new keys
- `frontend/public/i18n/da.json` — new keys
