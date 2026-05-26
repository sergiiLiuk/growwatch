# 3-Day Weather Forecast & Plant Danger Warnings — Design

**Date:** 2026-05-26
**Status:** Approved for implementation

## Goal

Show the user the next 3 days of outside weather and proactively warn them when conditions in that window could harm their plants. Cover three risk classes: **frost**, **heat waves**, and **strong wind**. Warnings surface on the home dashboard, a dedicated `/forecast` page, the alerts page, and the daily digest.

## Background

- The frontend already calls Open-Meteo for current weather in [weather.service.ts](frontend/src/app/core/services/weather.service.ts). The same `/v1/forecast` endpoint returns daily forecast (min/max temp, max wind, weather code) for the next 7+ days with no API key required and no backend involvement.
- The user already has location-aware fetching (geolocation + Nominatim reverse-geocoding cached in localStorage).
- `UserSettings` is the established pattern for per-user thresholds (parallel to `tempMin/Max`, `humidityMin/Max`). Backend → GraphQL → Apollo Client → signals → `effectiveX()` computeds.
- Existing alerts and digest surfaces already accept structured items — both can be extended to include weather warnings without restructuring.

## Risk classes & default thresholds

| Risk  | Trigger                              | Severe                  | Default user-overridable |
|-------|--------------------------------------|-------------------------|--------------------------|
| Frost | daily min ≤ `frostThreshold` (2°C)   | min ≤ 0°C               | yes                      |
| Heat  | daily max ≥ `heatThreshold` (32°C)   | max ≥ 35°C              | yes                      |
| Wind  | daily max wind ≥ `windThreshold` (50 km/h) | max wind ≥ 70 km/h | yes                      |

"Severe" promotes the badge from amber to red and may unlock stronger advice text. The severe ceilings (0°C / 35°C / 70 km/h) are **fixed** — only the warning trigger is user-configurable.

## Architecture

### Data layer — extend `WeatherService`

Add a second fetch path that pulls 3 days of daily forecast in addition to current weather:

```ts
forecast = signal<DailyForecast[] | null>(null);

interface DailyForecast {
  date: string;          // YYYY-MM-DD (Open-Meteo timezone=auto)
  weatherCode: number;
  conditionLabel: string;
  conditionIcon: string;
  tempMin: number;       // °C
  tempMax: number;       // °C
  windMax: number;       // km/h
}

async fetchForecast(): Promise<void>;  // populates this.forecast()
```

Endpoint: `/v1/forecast?latitude=...&longitude=...&daily=temperature_2m_min,temperature_2m_max,wind_speed_10m_max,weather_code&forecast_days=3&timezone=auto`.

`fetchForecast()` is called alongside `fetchWeather()` from the same callers (home, /forecast page). Both can be triggered together via a new `fetchAll()` if useful, but the implementation will call them independently to keep responsibilities clear.

### Risk analysis — pure utility

New file `frontend/src/app/core/utils/weather-risk.ts`:

```ts
export type RiskType = 'frost' | 'heat' | 'wind';
export type Severity = 'warn' | 'severe';

export interface RiskMessage {
  type: RiskType;
  severity: Severity;
  icon: string;            // 🥶 / 🥵 / 💨
  i18nKey: string;         // 'forecast.risk.frostWarn' etc. — message body
  i18nParams: Record<string, number | string>;
  actionKey: string;       // 'forecast.action.frostCloseVents' etc.
}

export interface DailyRisk {
  date: string;
  hasFrost: boolean;
  hasHeat: boolean;
  hasWind: boolean;
  severity: Severity | null;   // null = no risk; worst across all classes
  messages: RiskMessage[];
}

export interface Thresholds {
  frost: number;
  heat: number;
  wind: number;
}

export const SEVERE_FROST_CEILING = 0;
export const SEVERE_HEAT_FLOOR = 35;
export const SEVERE_WIND_FLOOR = 70;

export function analyzeForecast(
  days: DailyForecast[],
  thresholds: Thresholds,
): DailyRisk[];
```

Pure function — no DI, no signals, easy to unit-test. Returns one `DailyRisk` per input day.

### Settings — three new fields

Add to `UserSettings` (backend model + GraphQL type + frontend service), parallel to existing temp/humidity thresholds:

- `frostThreshold` (Float, default 2)
- `heatThreshold` (Float, default 32)
- `windThreshold` (Float, default 50)

`UserSettingsService` exposes `effectiveFrostThreshold()` / `effectiveHeatThreshold()` / `effectiveWindThreshold()` and `setFrostThreshold/setHeatThreshold/setWindThreshold` + `resetWeatherThresholds()`.

## UI surfaces

### 1. Home dashboard — 3-day strip

A new row inserted **below the existing sensor cards, above the plant strip** in [home.component.ts](frontend/src/app/features/home/home.component.ts). Three equal-width cells:

```
[ Tue · ☀️ · 18°/4°  ]  [ Wed · 🌧️ · 15°/2° 🥶 ]  [ Thu · 💨 · 12°/0° 🥶💨 ]
```

Each cell:
- Day name (abbreviated, locale-aware: Tue / Tir)
- Weather icon (existing `weatherInfo()` mapping)
- `tempMax°/tempMin°` (rounded)
- Risk badges (🥶 frost / 🥵 heat / 💨 wind), one per detected risk
- Cell background: white when no risk, `bg-gw-amber-light` when `severity='warn'`, `bg-gw-red-light` when `severity='severe'` (add `bg-gw-red-light` token if it doesn't exist; otherwise reuse the existing red surface token)

The whole strip is a `routerLink="/forecast"`. Cursor pointer, soft hover border like sensor cards.

### 2. `/forecast` page — detail view

New route `/forecast`, lazy-loaded `ForecastPageComponent` at `frontend/src/app/features/forecast/forecast.component.ts`. Structure (mirrors the insights page pattern):

```
‹ Home

3-day forecast                         ← h1
Outside weather and risks for your greenhouse  ← subtitle

[ Today — Tuesday, 26 May ]                ← card
  ☀️ Clear sky
  Low 4° · High 18° · Wind to 12 km/h
  ─────────────────────────────────────
  ✓ No risks expected

[ Tomorrow — Wednesday, 27 May ]
  🌧️ Rain
  Low 2° · High 15° · Wind to 35 km/h
  ─────────────────────────────────────
  🥶 Frost risk overnight
    Lows of 2°C are at the edge of damage for cold-sensitive plants.
    → Close vents tonight and check tomatoes, peppers, basil.

[ Thursday, 28 May ]
  💨 Windy
  Low 0° · High 12° · Wind to 65 km/h
  ─────────────────────────────────────
  🥶 Severe frost overnight  (red badge)
    Forecast min 0°C — direct damage risk for warm-season crops.
    → Move pots indoors or add row cover overnight.
  💨 Strong wind expected
    Gusts up to 65 km/h may damage greenhouse cover.
    → Secure loose panels and shade cloth.
```

- Each risk message has an **icon**, a **severity color** (amber/red), a **body sentence** (the "why"), and an **action sentence** (the "what to do").
- Days with no risk show "✓ No risks expected" in muted text.
- Loading skeleton + empty state when forecast hasn't loaded yet.
- Back button returns to home.

### 3. Alerts page integration

Extend [alerts.component.ts](frontend/src/app/features/alerts/alerts.component.ts) to inject `WeatherService` + `UserSettingsService`, run `analyzeForecast()`, and emit one alert per **risk per day** in the next **24 hours only** (don't spam the alerts page with day-2 and day-3 risks).

Alert shape matches existing alerts (icon, label, message, timestamp). The icon is the risk's emoji (🥶/🥵/💨), the label is `forecast.alert.frostTitle` etc., and the message body uses the same `i18nKey` from `RiskMessage`. New "Weather" group header in the alerts list, rendered above the existing sensor alerts (since weather forecasts are forward-looking).

Weather alerts are NOT persisted to `growwatch-alerts-read` — they auto-clear when the forecast no longer shows risk. (Sensor alerts keep their existing localStorage read-state.)

### 4. Digest integration

In [digest.component.ts](frontend/src/app/features/digest/digest.component.ts) `digestItems()`, append weather risk items **only for the day the digest is for** (today). One item per detected risk type, before or after sensor items:

- Label: "Frost risk tonight" / "Heat wave today" / "Strong wind expected"
- Message: same body as on `/forecast`
- Detail: short threshold detail, e.g. "min 1°C"
- Status: `'warn'`

These items count toward the existing `warnings` total in the summary message, so the lead-in (`summaryManyWarnings`) reflects them. They are NOT shown if `digestItems()` is empty (no sensor data) — we don't want to fabricate a digest from forecast alone.

## i18n — new keys

All under a new `forecast.*` namespace in both `en.json` and `da.json`:

- `forecast.title`, `forecast.subtitle`
- `forecast.today`, `forecast.tomorrow`
- `forecast.lowHighWind` ({low}, {high}, {wind})
- `forecast.noRisks`
- Per risk + severity:
  - `forecast.risk.frostWarn` / `frostSevere`
  - `forecast.risk.heatWarn` / `heatSevere`
  - `forecast.risk.windWarn` / `windSevere`
- Action lines:
  - `forecast.action.frost`, `forecast.action.heat`, `forecast.action.wind`
- Alert titles (used on alerts page):
  - `forecast.alert.frostTitle`, `forecast.alert.heatTitle`, `forecast.alert.windTitle`
- Digest labels:
  - `forecast.digest.frostLabel`, `forecast.digest.heatLabel`, `forecast.digest.windLabel`
  - `forecast.digest.frostDetail` ({min}), `forecast.digest.heatDetail` ({max}), `forecast.digest.windDetail` ({wind})
- Settings:
  - `settings.weatherWarnings`, `settings.frostThreshold`, `settings.heatThreshold`, `settings.windThreshold`, `settings.weatherWarningsHint`
- Risk badge labels (for screen readers / tooltips):
  - `forecast.badge.frost`, `forecast.badge.heat`, `forecast.badge.wind`

All risk messages and actions use placeholders for the actual numbers so a Danish reader sees the threshold value naturally interpolated.

## Files touched

**Backend:**
- `backend/src/models.ts` — three new fields on `UserSettings`
- `backend/src/schema.ts` — `UserSettings` type + `updateUserSettings` args
- `backend/src/resolvers.ts` — read/write the new fields

**Frontend (new):**
- `frontend/src/app/core/utils/weather-risk.ts`
- `frontend/src/app/features/forecast/forecast.component.ts`
- `frontend/src/app/shared/components/atoms/forecast-strip.component.ts` (the home 3-day strip)
- `frontend/src/app/core/utils/weather-risk.spec.ts` (vitest, pure unit tests)

**Frontend (modified):**
- `frontend/src/app/core/services/weather.service.ts` — add `forecast` signal + `fetchForecast()` + `DailyForecast` type
- `frontend/src/app/core/services/user-settings.service.ts` — three thresholds + getters + setters
- `frontend/src/app/features/settings/settings.component.ts` — "Weather warnings" section
- `frontend/src/app/features/home/home.component.ts` — import and place `ForecastStripComponent`
- `frontend/src/app/features/alerts/alerts.component.ts` — inject weather, append risk alerts
- `frontend/src/app/features/digest/digest.component.ts` — append risk items
- `frontend/src/app/app.routes.ts` — `/forecast` route
- `frontend/public/i18n/en.json`, `frontend/public/i18n/da.json` — all new keys

## Testing

**Automated:** `weather-risk.spec.ts` covers the pure analyzer:
- No risks when forecast is comfortably inside thresholds
- Frost warn at exactly threshold
- Frost severe at the severe ceiling
- Heat warn / severe analogous
- Wind warn / severe analogous
- Multiple risks on the same day combine correctly
- Empty / null forecast yields empty `DailyRisk[]`

**Manual:**
1. Open home → 3-day strip renders with day names, icons, temps.
2. Force a low forecast threshold (`frostThreshold=20`) in Settings → strip cells show 🥶 badges and amber background; alerts page lists a frost alert.
3. Open `/forecast` → each day card lists the same risks with action text.
4. Switch language to Danish → all strings localized.
5. Reset thresholds → warnings clear.
6. Set digest enabled and visit `/digest` → frost line appears in the summary list.

## Out of scope

- **No backend changes for the forecast itself** — fetched client-side from Open-Meteo, same as current weather.
- **No push notifications, email, or SMS** — warnings are in-app only.
- **No hourly forecast graph** on `/forecast`. The summary numbers are enough for the MVP.
- **No precipitation, hail, snow, or humidity risks** — user explicitly excluded.
- **No plant-specific tolerance lookup** — single shared thresholds rather than per-plant. Could be a future enhancement once the basic warning UX is validated.
- **No historical forecast accuracy tracking** — we trust Open-Meteo.
