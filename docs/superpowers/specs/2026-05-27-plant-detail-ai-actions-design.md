# Plant Detail — AI Recommendations, Action Log, History — Design

**Date:** 2026-05-27
**Status:** Approved for implementation

## Goal

Turn the plant detail page from a static info card into the working hub for caring for a plant: surface rule-based + AI-generated recommendations, let the user log actions (water, fertilize, prune, note) with one tap, show a history of those actions, and allow archiving when the season ends.

The "AI" piece is built end-to-end behind an `LlmProvider` interface, but ships with a `StubLlmProvider` so no external LLM call is made until a real provider is wired in.

## Background

- Current `/plants/:id` ([plant-detail.component.ts](frontend/src/app/features/plants/plant-detail.component.ts)) shows only the header card with age, planted date, and count.
- `Plant` is per-user, persisted in MongoDB. `Plant.monitored: Boolean` already controls whether sensor alerts include it.
- `UserSettingsService.effectiveHumidityMin/Max` is available for rule-based reasoning about current conditions.
- `SensorService.getLatestSensorData()` returns the most recent live reading (used by home dashboard).
- No action log or AI plumbing exists yet.

## Architecture

### Backend collections

**`PlantAction`** — append-only log of what the user did:

```ts
interface IPlantAction extends Document {
  plantId: string;
  userId: string;
  type: 'water' | 'fertilize' | 'prune' | 'note';
  note?: string;       // only used when type === 'note', and optional for other types as a side-comment
  createdAt: Date;
}
```

Indexed on `{ userId, plantId, createdAt: -1 }`.

**`SmartTip`** — per-plant cache so we don't re-hit a provider on every page view:

```ts
interface ISmartTip extends Document {
  plantId: string;
  userId: string;
  text: string;
  source: 'stub' | string;   // e.g. 'openai-gpt-4o', 'anthropic-claude-3.5'
  generatedAt: Date;
}
```

Indexed on `{ userId, plantId }` unique. Re-generated when older than 24h or when user clicks refresh.

### Plant schema additions

```ts
archived?: boolean;  // default false
```

`archived` is **separate from `monitored`**:
- `monitored=false` (paused): plant still visible on `/plants`, but excluded from sensor-alert recipients
- `archived=true`: plant hidden from `/plants` by default; history preserved; UI is read-only on the detail page

### Smart tip service & provider interface

Backend `services/smartTip.ts`:

```ts
export interface LlmProvider {
  readonly source: string;
  generate(context: TipContext): Promise<string>;
}

export interface TipContext {
  plant: { type: string; name: string; plantedDate: Date; ageWeeks: number };
  latestReading: { temperature?: number; humidity?: number; lightLevel?: number } | null;
  recentActions: { type: string; daysAgo: number }[];
  locale: 'en' | 'da';
}

export class StubLlmProvider implements LlmProvider {
  readonly source = 'stub';
  async generate(ctx: TipContext): Promise<string> { /* templated text */ }
}

export class SmartTipService {
  constructor(private provider: LlmProvider) {}
  async getOrGenerate(plantId, userId): Promise<SmartTip>;
  async refresh(plantId, userId): Promise<SmartTip>;
}
```

Provider is wired up at server boot in [backend/src/index.ts](backend/src/index.ts):
```ts
const llmProvider = new StubLlmProvider();   // swap here when a real provider lands
const smartTipService = new SmartTipService(llmProvider);
```

The stub provider returns plant-type-specific templated text in the requested locale. Example for tomato:
> "Tomatoes in week {n} often need staking and side-shoot pinching. Humidity is {h}% today — keep an eye on early blight if it stays above 80%."

The template table lives alongside `StubLlmProvider`. When a real provider is added, the table is no longer used.

### GraphQL surface

**Queries:**
- `plantActions(plantId: String!, limit: Int): [PlantAction!]!`
- `smartTip(plantId: String!): SmartTip`   (returns cached, generates on miss)

**Mutations:**
- `logPlantAction(plantId: String!, type: PlantActionType!, note: String): PlantAction!`
- `removePlantAction(id: String!): Boolean!`
- `refreshSmartTip(plantId: String!): SmartTip!`
- `setPlantArchived(id: String!, archived: Boolean!): Plant!`

All resolvers scope by `ctx.user.userId` (strict, no superuser fallback — matches existing pattern).

### Frontend rules engine — `recommendations.ts`

Pure utility, easy to unit-test:

```ts
export type RecSeverity = 'info' | 'warn';

export interface Recommendation {
  id: 'water' | 'fertilize';
  severity: RecSeverity;
  titleKey: string;
  bodyKey: string;
  bodyParams: Record<string, number | string>;
}

export function waterRecommendation(
  plant: Plant,
  actions: PlantAction[],
  humidity: number | null,
): Recommendation | null;

export function fertilizeRecommendation(
  plant: Plant,
  actions: PlantAction[],
): Recommendation | null;
```

**Rule defaults:**
- Water: warn when (`daysSinceLastWater > 5` AND `humidity < 50`) OR `daysSinceLastWater > 7`
- Fertilize: warn when `daysSinceLastFertilize > 14`

Returns `null` when no recommendation is warranted. Component composes the list and renders each as a card.

## UI sections on `/plants/:id`

Insertion order beneath the existing header card:

### 1. Recommendations card (`ANBEFALINGER`)

A bordered container holding 0..N entries:

- **Rule-based**: amber left-border. Title + body (1-2 sentences with concrete numbers).
- **Smart tip**: green left-border, `BETA` chip top-right, refresh icon button. Body is the tip text. Loading skeleton while generating. Source attribution in subtle gray ("via {source}") below the body in dev mode only.

If both rule-based recs and the tip return nothing, the whole card hides.

### 2. Log action card (`LOG HANDLING`)

A 4-column grid:

| 💧 Water       | 🌱 Fertilize    | ✂️ Prune       | 📝 Note         |
|----------------|-----------------|----------------|-----------------|
| "7 days" / "Never"  | "14 days" / "Never" | "Never"        | "Add"           |

- Water / Fertilize / Prune: tap → logs immediately, button briefly shows a check + animates the subtitle to "today"
- Note: tap → opens a small modal with a multi-line text field + Save/Cancel
- Active state: most-recent action type gets the highlighted background (light red/green/blue per type) matching the mockup

The subtitle uses relative time keys: `plantDetail.todayLabel`, `plantDetail.daysAgoShort` (`{n}d`), `plantDetail.never`.

### 3. History card (`HISTORIK`)

- Last 4 actions ordered newest first
- Each row: icon (per type), label ("Watered" / "Fertilized" / note title), relative date ("Yesterday · 25 May" / "12 May · 7 days ago")
- Footer link: "See all actions →" → opens `PlantHistoryComponent` modal (or dedicated route, see below) showing the full log with per-row delete
- Notes show the first line of text as the label; on the modal each row expands the full note

History modal/page: I'll use a **modal** (`PlantHistoryModalComponent`) reusing the existing modal pattern. Avoids adding a route and matches the bottom-sheet aesthetic of the existing edit modal.

### 4. Archive footer

- Card with copy: "Sæsonen slut? Arkivér og bevar historikken."
- Right-aligned `Arkivér` button
- Click → confirmation modal → calls `setPlantArchived(id, true)`
- On the `/plants` list: archived plants are filtered out by default; a small "Show archived (N)" toggle above the list reveals them
- Archived detail page: action buttons, recommendations, and smart tip are hidden; only the header card, history, and an "Unarchive" button remain

## i18n

New `plantDetail.*` namespace covering:

- Section headers: `recommendations`, `logAction`, `history`, `archive`
- Recommendation messages: `rec.waterNeededTitle`, `rec.waterNeededBody` (`{days}`, `{humidity}`), `rec.fertilizeNeededTitle`, `rec.fertilizeNeededBody` (`{days}`)
- Action labels: `action.water`, `action.fertilize`, `action.prune`, `action.note`
- Action history relative dates: `daysAgoShort` (`{n}d`), `never`, `today`
- History row labels: `history.watered`, `history.fertilized`, `history.pruned`, `history.notePrefix`
- Smart tip: `smartTip.title`, `smartTip.beta`, `smartTip.refresh`, `smartTip.loading`, `smartTip.error`, `smartTip.stubBody.{plantType}` (template strings — only stub provider reads these)
- Archive: `archive.prompt`, `archive.button`, `archive.confirmTitle`, `archive.confirmBody`, `archive.unarchive`, `plants.showArchived`
- Note modal: `noteModal.title`, `noteModal.placeholder`, `noteModal.save`, `noteModal.cancel`

All keys added to both `en.json` and `da.json`.

## Files touched

**Backend (new):**
- `backend/src/services/smartTip.ts` — `LlmProvider`, `TipContext`, `StubLlmProvider`, `SmartTipService`

**Backend (modified):**
- `backend/src/models.ts` — `PlantAction`, `SmartTip` schemas; `archived` field on `Plant`
- `backend/src/schema.ts` — `PlantAction`, `SmartTip`, `PlantActionType` enum; new queries/mutations
- `backend/src/resolvers.ts` — query/mutation implementations + smart tip wiring
- `backend/src/index.ts` — instantiate provider and service

**Frontend (new):**
- `frontend/src/app/core/services/plant-action.service.ts` — CRUD for actions + smart tip
- `frontend/src/app/core/utils/recommendations.ts` — pure rules engine
- `frontend/src/app/features/plants/plant-recommendations.component.ts` — rec + smart tip block
- `frontend/src/app/features/plants/plant-action-log.component.ts` — 4-button log grid
- `frontend/src/app/features/plants/plant-history.component.ts` — last-N history block
- `frontend/src/app/features/plants/plant-history-modal.component.ts` — full history + delete
- `frontend/src/app/features/plants/plant-note-modal.component.ts` — free-form note input
- `frontend/src/app/features/plants/plant-archive-card.component.ts` — archive footer

**Frontend (modified):**
- `frontend/src/app/core/services/plant.service.ts` — `archived` field on Plant interface; `setArchived(id, value)`; default list filters out archived; expose `archivedPlants` computed
- `frontend/src/app/features/plants/plant-detail.component.ts` — wire in all new sub-components and the recommendations engine
- `frontend/src/app/features/plants/plants.component.ts` — "Show archived" toggle + filter
- `frontend/public/i18n/en.json`, `frontend/public/i18n/da.json` — new keys

## Testing

**Backend manual:**
- `logPlantAction` mutation creates a row; `plantActions` query returns it scoped to the calling user
- `smartTip` returns cached result on second call; `refreshSmartTip` forces regeneration
- `setPlantArchived(true)` excludes from default `plants` query unless explicitly requested

**Frontend automated (vitest):**
- `recommendations.spec.ts`: water rule triggers at the boundaries, fertilize rule triggers at 14 days, returns null otherwise

**Frontend manual:**
- Log a water action → "7 days" subtitle resets to "today", history gains an entry, water recommendation clears
- Open note modal → free text → saves, appears in history with first line as the label
- Smart tip card shows stub text on first view; refresh button generates a new one
- Archive a plant → disappears from `/plants` list; "Show archived" reveals it; archived detail page hides action sections
- Switch language to Danish → all new strings translated

## Out of scope (now)

- Real LLM integration — `LlmProvider` interface ready, only `StubLlmProvider` shipped
- Editing existing actions — only log + delete
- Photo uploads per action
- Push/email reminders
- Calendar view of actions
- Notes categories / tags — free-form text only (confirmed)
- Smart-tip personalization across language switches mid-cache — when the tip is cached as English and the user switches to Danish, they see English until next refresh or expiry. Acceptable for MVP.
