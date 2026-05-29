# Twice-Daily Claude-Powered Smart Tips — Design

**Date:** 2026-05-29
**Status:** Approved for implementation

## Goal

Replace the templated `StubLlmProvider` smart tips with real Claude-generated advice. A single API call per cycle (morning + evening) produces a greenhouse-wide overview *and* a per-plant tip for every monitored plant. Users can change the morning/evening times in Settings or disable smart tips entirely.

## Background

- The smart tip plumbing already exists from [docs/superpowers/specs/2026-05-27-plant-detail-ai-actions-design.md](docs/superpowers/specs/2026-05-27-plant-detail-ai-actions-design.md): `LlmProvider` interface, `SmartTipService`, `SmartTip` collection cached per plant, refresh button on the plant detail card.
- The existing `LlmProvider.generate(TipContext)` is per-plant. We need a new interface that returns a structured briefing covering all plants in one call. That's the cost-saving change.
- `UserSettings` is the established pattern for per-user prefs ([backend/src/models.ts](backend/src/models.ts)), and the existing digest scheduler uses `node-cron` on the backend.
- The frontend already loads weather forecast via `WeatherService` and the latest sensor reading via `SensorService.getLatestSensorData()` — both available for context.

## Architecture

### Provider interface — redesigned

The existing per-plant interface is replaced. Both the stub and the new Claude provider implement:

```ts
// backend/src/services/smartTip.ts
export interface DailyForecastSnapshot {
  date: string;
  tempMin: number;
  tempMax: number;
  windMax: number;
  conditionLabel: string;
}

export interface CurrentWeatherSnapshot {
  temperature: number;
  humidity: number;
  conditionLabel: string;
  city: string;
}

export interface BriefingPlant {
  id: string;
  name: string;
  type: string;
  ageWeeks: number;
  recentActions: { type: 'water' | 'fertilize' | 'prune' | 'note'; daysAgo: number; note?: string }[];
}

export interface BriefingContext {
  cycle: 'morning' | 'evening';
  locale: 'en' | 'da';
  weather: { current: CurrentWeatherSnapshot | null; forecast3d: DailyForecastSnapshot[] };
  sensors: { temperature?: number; humidity?: number; co2?: number; lightLevel?: number } | null;
  plants: BriefingPlant[];
}

export interface Briefing {
  overview: string;                   // 1-2 sentences, greenhouse-wide
  plantTips: Record<string, string>;  // keyed by plantId
}

export interface LlmProvider {
  readonly source: string;
  generateBriefing(ctx: BriefingContext): Promise<Briefing>;
}
```

The previous `generate(TipContext)` method is removed. `SmartTipService.regenerate(plantId, userId)` becomes `SmartTipService.regenerateForUser(userId)` and produces a briefing covering all the user's monitored plants in one call.

### Provider implementations

- **`StubLlmProvider`** (existing, rewritten) — returns templated strings for overview + each plant. Keeps offline / no-API-key dev mode working.
- **`ClaudeLlmProvider`** (new) — single user-message call to `claude-haiku-4-5` with the briefing context inlined. Asks Claude to return strict JSON: `{ "overview": "...", "plantTips": { "<plantId>": "...", ... } }`. Uses `@anthropic-ai/sdk` (new dep) and reads `ANTHROPIC_API_KEY` from `.env`. On any failure (network, malformed JSON, missing keys), throws — caller logs and skips.

The provider is chosen at boot in [backend/src/index.ts](backend/src/index.ts):
```ts
const llmProvider: LlmProvider = process.env.ANTHROPIC_API_KEY
  ? new ClaudeLlmProvider({ apiKey: process.env.ANTHROPIC_API_KEY, model: 'claude-haiku-4-5' })
  : new StubLlmProvider();
```

### Claude prompt strategy

System prompt: short greenhouse-assistant persona, instructs to return only JSON matching the schema, locale-aware.

User message: serialized briefing context with cycle framing:
- **Morning** prompt: "It's morning. Based on the conditions and forecast below, what should the gardener plan for today? Give one greenhouse-wide overview (1-2 sentences) and one short tip per monitored plant (1-2 sentences each)."
- **Evening** prompt: "It's evening. Based on the day's conditions and what was logged, give a short review and tell the gardener what to watch overnight or first thing tomorrow. One greenhouse-wide overview (1-2 sentences) plus one short per-plant note."

JSON enforced via Anthropic's `response_format` / structured-output pattern; parsed and validated server-side. Per-plant tips for unknown plant IDs are dropped silently.

**Cost ballpark** with `claude-haiku-4-5` (~$0.25 / $1.25 per M input/output tokens at time of writing; subject to change):
- Input ~1500 tokens (context + prompt) ≈ $0.0004
- Output ~600 tokens (overview + ~5 plants × tips) ≈ $0.00075
- ≈ **$0.0012 per call × 2/day × 365 ≈ $0.88/year per user**

### Storage

Two changes:

1. **Existing `SmartTip` collection** gets a `cycle: 'morning' | 'evening'` field. Still one row per plant; replaced each cycle.

2. **New `DailyBriefing` collection** for the greenhouse-wide overview:
```ts
interface IDailyBriefing extends Document {
  userId: string;
  cycle: 'morning' | 'evening';
  overview: string;
  source: string;
  generatedAt: Date;
}
```
Unique index on `userId`; one row per user, replaced each cycle.

### Scheduler

Single backend `node-cron` job at `"* * * * *"` (every minute). Each tick:

1. Read current server time → `HH:MM`.
2. Query users where `smartTipsEnabled !== false` and (`morningTipTime === currentHHMM` or `eveningTipTime === currentHHMM`).
3. For each match, atomically claim the cycle by checking a per-user `lastSmartTipRun: { morning: date, evening: date }` field on `UserSettings` — skip if same calendar date already processed for that cycle.
4. Gather context:
   - Latest in-memory sensor reading (from `sensorDataStore`)
   - 3-day forecast (re-fetch via Open-Meteo with the user's location; for v1 use the same hardcoded default `lat: 55.68, lng: 12.57` location since location is currently client-side localStorage. **Stored briefing context** field carries the lat/lng — see "Timezones & location" below)
   - Monitored plants + last 7 days of actions per plant
   - User locale
5. Call `provider.generateBriefing()`.
6. Persist `DailyBriefing` (overview) and one `SmartTip` per plant.
7. Update `lastSmartTipRun.<cycle>` on `UserSettings`.

If step 5 throws, the run is **not** marked complete (so it retries next minute if the configured minute hasn't passed yet — but only once per cycle thanks to the date check). After 5 minutes past the configured time without success, the cycle is abandoned for the day.

### Timezones & location

**v1 uses server local time.** The cron fires on the server's clock, and `morningTipTime` / `eveningTipTime` values are interpreted in that timezone. Documented assumption.

**Location for weather context**: today the user's lat/lng lives in browser `localStorage`. The backend scheduler has no access. For v1, the user's location is moved into `UserSettings.location: { lat, lng, city }`, written by the existing frontend `WeatherService` on first geolocate, used by the scheduler. (The existing localStorage path stays as a fast-path cache.)

### Settings additions

Three new fields on `UserSettings`:
- `smartTipsEnabled: Boolean` (default `true`)
- `morningTipTime: String` (`HH:MM`, default `"07:00"`)
- `eveningTipTime: String` (`HH:MM`, default `"20:00"`)

Plus the location field above:
- `location: { lat: Number, lng: Number, city: String }`

And the run tracker (server-internal, not exposed):
- `lastSmartTipRun: { morning: Date, evening: Date }`

Settings page gains a "Smart tips" section beneath "Weather warnings":
- Toggle: enabled / disabled
- Morning time picker (`<input type="time">`, mirrors existing `digestTime` UX)
- Evening time picker

## Frontend display

- **Plant detail page**: existing smart tip card now shows the cycle label ("Morning brief · 07:14" / "Evening brief · 20:03") above the body. No structural change.
- **Home dashboard**: new compact "Today's brief" card placed just below the weather/phase hero row (above the forecast strip), shows the overview text + a small ✨ icon + cycle timestamp. Hidden when no briefing exists yet.
- **Refresh button** on the plant detail tip stays. Calls a new `regenerateBriefing` mutation that runs the same provider call out-of-cycle, replaces overview + all per-plant tips for that user, then re-renders the detail card. Single code path.

## i18n

New keys, en + da:
- `briefing.morningBrief`, `briefing.eveningBrief`
- `home.todaysBrief`
- `settings.smartTips`, `settings.smartTipsEnabled`, `settings.morningTipTime`, `settings.eveningTipTime`, `settings.smartTipsHint`
- Stub-only fallback strings for the templated provider (kept from current implementation)

## Files touched

**Backend (new):**
- `backend/src/services/claudeLlmProvider.ts` — `ClaudeLlmProvider` class, Anthropic SDK wrapper, prompt builder
- `backend/src/services/smartTipScheduler.ts` — cron tick that selects users and orchestrates briefing generation

**Backend (modified):**
- `backend/src/services/smartTip.ts` — new `LlmProvider`/`BriefingContext`/`Briefing` types; rewritten `StubLlmProvider`; `SmartTipService.regenerateForUser`; `SmartTip` schema gains `cycle`; new `DailyBriefing` model
- `backend/src/models.ts` — extend `UserSettings` (`smartTipsEnabled`, `morningTipTime`, `eveningTipTime`, `location`, `lastSmartTipRun`); add `DailyBriefing`
- `backend/src/schema.ts` — expose new `UserSettings` fields, `DailyBriefing` type, `dailyBriefing` query, `regenerateBriefing` mutation
- `backend/src/resolvers.ts` — wire the new query/mutation; provider selection at boot
- `backend/src/index.ts` — instantiate provider + scheduler
- `backend/package.json` + `package-lock.json` — add `@anthropic-ai/sdk`
- `backend/.env.example` — document `ANTHROPIC_API_KEY`

**Frontend (modified):**
- `frontend/src/app/core/services/user-settings.service.ts` — fields, getters, setters, location persistence
- `frontend/src/app/core/services/weather.service.ts` — on resolve, also write lat/lng to UserSettings
- `frontend/src/app/core/services/plant-action.service.ts` — replace `getSmartTip`/`refreshSmartTip` with `getDailyBriefing` + `regenerateBriefing`; per-plant tip still fetched (server returns it as before)
- `frontend/src/app/features/settings/settings.component.ts` — Smart tips section
- `frontend/src/app/features/home/home.component.ts` — "Today's brief" card
- `frontend/src/app/features/plants/plant-detail.component.ts` — surface cycle label
- `frontend/public/i18n/en.json`, `frontend/public/i18n/da.json` — new keys

## Testing

**Backend:**
- `StubLlmProvider.generateBriefing` returns deterministic content for a known context
- Scheduler: given a fake clock and a fixed `morningTipTime`, the briefing is generated exactly once that day
- Resolver: `regenerateBriefing` mutation calls the provider, writes both collections, returns the briefing

**Manual:**
- Set `ANTHROPIC_API_KEY` in `.env`, restart backend; tip card on plant detail shows Claude content after the first scheduled cycle (or via refresh button)
- Change morning time to next minute → after that minute, briefing is generated and visible
- Disable smart tips in settings → next cycle is skipped, existing tips stay frozen
- Unplug API key and restart → falls back to stub, app still works

## Out of scope

- Per-user timezone — server local time only for v1
- Backfilling old plants whose location is still in localStorage — handled by next page load
- Streaming the Claude response to the UI — single shot, no streaming
- Cost/usage dashboard — log per-call cost via `ANTHROPIC_API_KEY` usage and revisit later
- Falling back to stub mid-failure — if Claude fails, current tip remains; no silent stub substitution
- Manual prompt editing in UI — prompt is hardcoded
