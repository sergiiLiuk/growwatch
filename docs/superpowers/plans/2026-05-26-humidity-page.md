# Humidity Insights Page Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a `/humidity` insights page that mirrors `/temperature`, with user-configurable humidity range in Settings and a clickable home sensor card.

**Architecture:** Reuse the `TemperatureInsightsComponent` structure (live card → today card → week chart). Humidity range becomes a new pair of fields on `UserSettings`, flowing through GraphQL like `tempMin`/`tempMax`. The home humidity sensor card gets a `link="/humidity"` and the existing `getMood()` humidity check switches to the configurable thresholds.

**Tech Stack:** Angular 21 (standalone, signals), Apollo GraphQL Client, transloco i18n, Tailwind v4. Backend: Express + Apollo Server + Mongoose.

**Spec:** [docs/superpowers/specs/2026-05-26-humidity-page-design.md](docs/superpowers/specs/2026-05-26-humidity-page-design.md)

**Defaults:** `humidityMin=40`, `humidityMax=80` (% RH).

---

## Task 1: Backend — UserSettings schema fields

**Files:**
- Modify: [backend/src/models.ts](backend/src/models.ts)
- Modify: [backend/src/schema.ts](backend/src/schema.ts)
- Modify: [backend/src/resolvers.ts](backend/src/resolvers.ts)

- [ ] **Step 1: Add `humidityMin` / `humidityMax` to the `IUserSettings` interface and Mongoose schema**

In [backend/src/models.ts](backend/src/models.ts) update the `IUserSettings` interface (around line 130-140):

```ts
export interface IUserSettings extends Document {
    userId: string;
    tempMin?: number;
    tempMax?: number;
    humidityMin?: number;
    humidityMax?: number;
    digestTime?: string;
    digestEnabled?: boolean;
    alertsEnabled?: boolean;
    locale?: string;
    createdAt: Date;
    updatedAt: Date;
}
```

And in the `userSettingsSchema` definition (around line 142-153), add the two fields:

```ts
const userSettingsSchema = new Schema<IUserSettings>(
    {
        userId: { type: String, required: true, unique: true, index: true },
        tempMin: { type: Number },
        tempMax: { type: Number },
        humidityMin: { type: Number },
        humidityMax: { type: Number },
        digestTime: { type: String },
        digestEnabled: { type: Boolean },
        alertsEnabled: { type: Boolean },
        locale: { type: String },
    },
    { timestamps: true }
);
```

- [ ] **Step 2: Expose `humidityMin` / `humidityMax` on the `UserSettings` GraphQL type**

In [backend/src/schema.ts](backend/src/schema.ts) update the `UserSettings` type (lines 92-99):

```graphql
type UserSettings {
    tempMin: Float
    tempMax: Float
    humidityMin: Float
    humidityMax: Float
    digestTime: String
    digestEnabled: Boolean
    alertsEnabled: Boolean
    locale: String
}
```

And update the `updateUserSettings` mutation signature (lines 138-145):

```graphql
updateUserSettings(
    tempMin: Float
    tempMax: Float
    humidityMin: Float
    humidityMax: Float
    digestTime: String
    digestEnabled: Boolean
    alertsEnabled: Boolean
    locale: String
): UserSettings!
```

- [ ] **Step 3: Wire `humidityMin` / `humidityMax` through the resolvers**

In [backend/src/resolvers.ts](backend/src/resolvers.ts), update the `myUserSettings` resolver return object (around lines 349-356):

```ts
return {
    tempMin: settings?.tempMin ?? null,
    tempMax: settings?.tempMax ?? null,
    humidityMin: settings?.humidityMin ?? null,
    humidityMax: settings?.humidityMax ?? null,
    digestTime: settings?.digestTime ?? null,
    digestEnabled: settings?.digestEnabled ?? null,
    alertsEnabled: settings?.alertsEnabled ?? null,
    locale: settings?.locale ?? null,
};
```

Update the `updateUserSettings` mutation args type and `apply()` calls (around lines 450-478):

```ts
updateUserSettings: async (
    _: any,
    args: {
        tempMin?: number | null;
        tempMax?: number | null;
        humidityMin?: number | null;
        humidityMax?: number | null;
        digestTime?: string | null;
        digestEnabled?: boolean | null;
        alertsEnabled?: boolean | null;
        locale?: string | null;
    },
    ctx: Ctx
) => {
    if (!ctx.user) throw new Error('Unauthorized');

    const $set: any = {};
    const $unset: any = {};

    const apply = <T>(key: string, value: T | null | undefined, validate: (v: any) => boolean) => {
        if (value === null) $unset[key] = '';
        else if (value !== undefined && validate(value)) $set[key] = value;
    };

    apply('tempMin', args.tempMin, (v) => typeof v === 'number');
    apply('tempMax', args.tempMax, (v) => typeof v === 'number');
    apply('humidityMin', args.humidityMin, (v) => typeof v === 'number');
    apply('humidityMax', args.humidityMax, (v) => typeof v === 'number');
    apply('digestTime', args.digestTime, (v) => typeof v === 'string');
    apply('digestEnabled', args.digestEnabled, (v) => typeof v === 'boolean');
    apply('alertsEnabled', args.alertsEnabled, (v) => typeof v === 'boolean');
    apply('locale', args.locale, (v) => typeof v === 'string');

    const update: any = { $setOnInsert: { userId: ctx.user.userId } };
    if (Object.keys($set).length) update.$set = $set;
    if (Object.keys($unset).length) update.$unset = $unset;

    const settings = await UserSettings.findOneAndUpdate(
        { userId: ctx.user.userId },
        update,
        { upsert: true, new: true }
    ).lean();
    return {
        tempMin: settings?.tempMin ?? null,
        tempMax: settings?.tempMax ?? null,
        humidityMin: settings?.humidityMin ?? null,
        humidityMax: settings?.humidityMax ?? null,
        digestTime: settings?.digestTime ?? null,
        digestEnabled: settings?.digestEnabled ?? null,
        alertsEnabled: settings?.alertsEnabled ?? null,
        locale: settings?.locale ?? null,
    };
},
```

- [ ] **Step 4: Verify backend builds**

Run: `cd backend && npm run build`
Expected: Compiles with no TypeScript errors.

- [ ] **Step 5: Commit**

```bash
git add backend/src/models.ts backend/src/schema.ts backend/src/resolvers.ts
git commit -m "feat(backend): add humidityMin/humidityMax to UserSettings"
```

---

## Task 2: Frontend — UserSettingsService humidity fields

**Files:**
- Modify: [frontend/src/app/core/services/user-settings.service.ts](frontend/src/app/core/services/user-settings.service.ts)

- [ ] **Step 1: Add defaults, signals, computeds, GraphQL fields**

Update [frontend/src/app/core/services/user-settings.service.ts](frontend/src/app/core/services/user-settings.service.ts):

In the class body, after `DEFAULT_TEMP_MAX = 30`, add:

```ts
readonly DEFAULT_HUMIDITY_MIN = 40;
readonly DEFAULT_HUMIDITY_MAX = 80;
```

After `tempMax = signal<number | null>(null);`, add:

```ts
humidityMin = signal<number | null>(null);
humidityMax = signal<number | null>(null);
```

After `effectiveTempMax`, add:

```ts
effectiveHumidityMin = computed(() => this.humidityMin() ?? this.DEFAULT_HUMIDITY_MIN);
effectiveHumidityMax = computed(() => this.humidityMax() ?? this.DEFAULT_HUMIDITY_MAX);
```

In the auth `effect()` that resets state on logout, add (alongside the existing `tempMin.set(null)` etc.):

```ts
this.humidityMin.set(null);
this.humidityMax.set(null);
```

- [ ] **Step 2: Extend the GraphQL query in `loadFromBackend`**

Update the `myUserSettings` query fragment (around line 89-93) to include the new fields:

```ts
const result = await this.apolloClient.query<{
    myUserSettings: {
        tempMin: number | null;
        tempMax: number | null;
        humidityMin: number | null;
        humidityMax: number | null;
        digestTime: string | null;
        digestEnabled: boolean | null;
        alertsEnabled: boolean | null;
        locale: string | null;
    };
}>({
    query: gql`
        query MyUserSettings {
            myUserSettings { tempMin tempMax humidityMin humidityMax digestTime digestEnabled alertsEnabled locale }
        }
    `,
    fetchPolicy: 'network-only',
});
```

And in the result-mapping block below, after `this.tempMax.set(s.tempMax);` add:

```ts
this.humidityMin.set(s.humidityMin);
this.humidityMax.set(s.humidityMax);
```

- [ ] **Step 3: Add setters and reset helper**

After `setTempMax(...)`, add:

```ts
setHumidityMin(value: number | null) { this.humidityMin.set(value); return this.persist({ humidityMin: value }); }
setHumidityMax(value: number | null) { this.humidityMax.set(value); return this.persist({ humidityMax: value }); }
```

After `resetTempRange()`, add:

```ts
async resetHumidityRange(): Promise<void> {
    this.humidityMin.set(null);
    this.humidityMax.set(null);
    return this.persist({ humidityMin: null, humidityMax: null });
}
```

- [ ] **Step 4: Extend `persist()` to accept and send the new fields**

Update the `persist()` args type and mutation:

```ts
private async persist(args: {
    tempMin?: number | null;
    tempMax?: number | null;
    humidityMin?: number | null;
    humidityMax?: number | null;
    digestTime?: string | null;
    digestEnabled?: boolean | null;
    alertsEnabled?: boolean | null;
    locale?: string | null;
}): Promise<void> {
    try {
        const result = await this.apolloClient.mutate<{
            updateUserSettings: {
                tempMin: number | null;
                tempMax: number | null;
                humidityMin: number | null;
                humidityMax: number | null;
                digestTime: string | null;
                digestEnabled: boolean | null;
                alertsEnabled: boolean | null;
                locale: string | null;
            };
        }>({
            mutation: gql`
                mutation UpdateUserSettings(
                    $tempMin: Float, $tempMax: Float,
                    $humidityMin: Float, $humidityMax: Float,
                    $digestTime: String, $digestEnabled: Boolean, $alertsEnabled: Boolean,
                    $locale: String
                ) {
                    updateUserSettings(
                        tempMin: $tempMin, tempMax: $tempMax,
                        humidityMin: $humidityMin, humidityMax: $humidityMax,
                        digestTime: $digestTime, digestEnabled: $digestEnabled, alertsEnabled: $alertsEnabled,
                        locale: $locale
                    ) { tempMin tempMax humidityMin humidityMax digestTime digestEnabled alertsEnabled locale }
                }
            `,
            variables: args,
        });
        const s = result.data?.updateUserSettings;
        if (s) {
            this.tempMin.set(s.tempMin);
            this.tempMax.set(s.tempMax);
            this.humidityMin.set(s.humidityMin);
            this.humidityMax.set(s.humidityMax);
            this.digestTime.set(s.digestTime);
            this.digestEnabled.set(s.digestEnabled);
            this.alertsEnabled.set(s.alertsEnabled);
            this.locale.set(s.locale);
        }
    } catch (err) {
        console.error('Failed to save user settings:', err);
    }
}
```

- [ ] **Step 5: Verify frontend type-checks**

Run: `cd frontend && npx tsc --noEmit`
Expected: No errors.

- [ ] **Step 6: Commit**

```bash
git add frontend/src/app/core/services/user-settings.service.ts
git commit -m "feat(settings): expose humidityMin/humidityMax in UserSettingsService"
```

---

## Task 3: i18n — new keys (en + da)

**Files:**
- Modify: [frontend/public/i18n/en.json](frontend/public/i18n/en.json)
- Modify: [frontend/public/i18n/da.json](frontend/public/i18n/da.json)

- [ ] **Step 1: Add `insights.*` humidity keys to `en.json`**

In [frontend/public/i18n/en.json](frontend/public/i18n/en.json), inside the `"insights"` object (ends at line 383), add these keys before the closing brace:

```json
"humidityTitle": "Humidity insights",
"humiditySubtitle": "Live reading and daily/weekly history",
"tooDry": "Too dry",
"tooHumid": "Too humid",
"belowHumidityFloor": "Below {{ min }}% optimal floor",
"aboveHumidityCeiling": "Above {{ max }}% optimal ceiling",
"withinHumidityRange": "Within {{ min }}–{{ max }}% optimal range",
"humidityDayTooltip": "{{ day }}: avg {{ avg }}%, range {{ min }}–{{ max }}%",
"driest": "Driest",
"wettest": "Wettest"
```

- [ ] **Step 2: Add the same keys to `da.json` (Danish translations)**

In [frontend/public/i18n/da.json](frontend/public/i18n/da.json), inside the matching `"insights"` object, add:

```json
"humidityTitle": "Fugtighedsindsigt",
"humiditySubtitle": "Aktuel måling og daglig/ugentlig historik",
"tooDry": "For tørt",
"tooHumid": "For fugtigt",
"belowHumidityFloor": "Under optimalt gulv på {{ min }}%",
"aboveHumidityCeiling": "Over optimalt loft på {{ max }}%",
"withinHumidityRange": "Inden for optimalt interval {{ min }}–{{ max }}%",
"humidityDayTooltip": "{{ day }}: gns. {{ avg }}%, interval {{ min }}–{{ max }}%",
"driest": "Tørreste",
"wettest": "Mest fugtige"
```

- [ ] **Step 3: Add `settings.humidityRange` keys to `en.json`**

Inside the `"settings"` object in [frontend/public/i18n/en.json](frontend/public/i18n/en.json), add:

```json
"humidityRange": "Humidity range",
"humidityAlertsTriggerOutside": "Alerts trigger when humidity is outside this range."
```

- [ ] **Step 4: Add `settings.humidityRange` keys to `da.json`**

```json
"humidityRange": "Fugtighedsinterval",
"humidityAlertsTriggerOutside": "Advarsler udløses, når fugtigheden er uden for dette interval."
```

- [ ] **Step 5: Verify JSON is valid**

Run: `cd frontend && node -e "JSON.parse(require('fs').readFileSync('public/i18n/en.json'));JSON.parse(require('fs').readFileSync('public/i18n/da.json'));console.log('ok')"`
Expected output: `ok`

- [ ] **Step 6: Commit**

```bash
git add frontend/public/i18n/en.json frontend/public/i18n/da.json
git commit -m "feat(i18n): add humidity insights and settings keys"
```

---

## Task 4: Settings page — humidity range section

**Files:**
- Modify: [frontend/src/app/features/settings/settings.component.ts](frontend/src/app/features/settings/settings.component.ts)

- [ ] **Step 1: Add humidity option list and handlers in the component class**

Find the line `readonly tempOptions = Array.from({ length: 41 }, (_, i) => i); // 0..40` (around line 273) and add below it:

```ts
readonly humidityOptions = Array.from({ length: 21 }, (_, i) => i * 5); // 0,5,10,...,100
```

After the existing `onTempMinChange` / `onTempMaxChange` / `resetTempRange` methods (around lines 280-297), add:

```ts
onHumidityMinChange(value: number | null) {
    this.settings.setHumidityMin(value);
}

onHumidityMaxChange(value: number | null) {
    this.settings.setHumidityMax(value);
}

resetHumidityRange() {
    this.settings.resetHumidityRange();
}
```

- [ ] **Step 2: Add the "Humidity range" UI section in the template**

In the template, insert a new section immediately after the "Temperature range" block (after the closing `</div>` for that block at line 129, before the `<!-- About -->` comment at line 131):

```html
<!-- Humidity range -->
<div class="mb-5">
  <div class="text-[11px] text-gray-400 mb-2 font-medium uppercase tracking-wide">{{ t('settings.humidityRange') }}</div>
  <div class="bg-white border-[0.5px] border-gray-200 rounded-xl p-4">
    <div class="flex items-center justify-center gap-3">

      <!-- Min -->
      <div class="flex-1 flex flex-col items-center">
        <span class="text-[10px] text-gray-400 uppercase tracking-wide mb-1.5">{{ t('settings.min') }}</span>
        <div class="relative">
          <select [ngModel]="settings.effectiveHumidityMin()" (ngModelChange)="onHumidityMinChange($event)"
                  class="appearance-none w-20 text-center text-[15px] font-medium text-gw-green-dark bg-white border-[0.5px] border-gw-green-light rounded-lg pl-2 pr-6 py-1.5 outline-none focus:border-gw-green transition-colors cursor-pointer">
            @for (h of humidityOptions; track h) {
              <option [ngValue]="h">{{ h }}%</option>
            }
          </select>
          <app-icon name="chevron-down" strokeWidth="2"
                    class="w-3 h-3 text-gw-green-dark/60 absolute right-2 top-1/2 -translate-y-1/2 pointer-events-none" />
        </div>
      </div>

      <span class="text-gray-300 text-[14px] pt-5">–</span>

      <!-- Max -->
      <div class="flex-1 flex flex-col items-center">
        <span class="text-[10px] text-gray-400 uppercase tracking-wide mb-1.5">{{ t('settings.max') }}</span>
        <div class="relative">
          <select [ngModel]="settings.effectiveHumidityMax()" (ngModelChange)="onHumidityMaxChange($event)"
                  class="appearance-none w-20 text-center text-[15px] font-medium text-gw-green-dark bg-white border-[0.5px] border-gw-green-light rounded-lg pl-2 pr-6 py-1.5 outline-none focus:border-gw-green transition-colors cursor-pointer">
            @for (h of humidityOptions; track h) {
              <option [ngValue]="h">{{ h }}%</option>
            }
          </select>
          <app-icon name="chevron-down" strokeWidth="2"
                    class="w-3 h-3 text-gw-green-dark/60 absolute right-2 top-1/2 -translate-y-1/2 pointer-events-none" />
        </div>
      </div>

    </div>
  </div>
  <div class="flex items-center justify-between mt-2 px-1">
    <p class="text-[11px] text-gray-400 leading-relaxed flex-1">
      {{ t('settings.humidityAlertsTriggerOutside') }}
    </p>
    <button (click)="resetHumidityRange()"
            class="text-[11px] text-gw-green-dark hover:underline ml-3 shrink-0">
      {{ t('settings.resetTo') }} ({{ settings.DEFAULT_HUMIDITY_MIN }}–{{ settings.DEFAULT_HUMIDITY_MAX }}%)
    </button>
  </div>
</div>
```

- [ ] **Step 3: Verify frontend type-checks**

Run: `cd frontend && npx tsc --noEmit`
Expected: No errors.

- [ ] **Step 4: Manual smoke test**

Run: `cd frontend && npm start`
Open `http://localhost:4200/settings`. Verify:
- "Humidity range" section renders below "Temperature range".
- Min/max dropdowns show 0–100% in steps of 5.
- Changing either persists (refresh page → value sticks).
- "Reset to (40–80%)" button restores defaults.
- Switch language to Danish → labels translate.

- [ ] **Step 5: Commit**

```bash
git add frontend/src/app/features/settings/settings.component.ts
git commit -m "feat(settings): add humidity range section"
```

---

## Task 5: Humidity Insights Component + route

**Files:**
- Create: `frontend/src/app/features/humidity/humidity-insights.component.ts`
- Modify: [frontend/src/app/app.routes.ts](frontend/src/app/app.routes.ts)

- [ ] **Step 1: Create the new component file**

Create `frontend/src/app/features/humidity/humidity-insights.component.ts` with the full content below. Structure mirrors `TemperatureInsightsComponent` exactly, with the following deliberate differences:
- Reads `humidity` / `avgHumidity` / `minHumidity` / `maxHumidity` fields
- Unit is `%` instead of `°C`
- `chartYMax` is a constant `100` (no dynamic scaling)
- `yAxisLabels` returns `{ top: '100', mid: '50' }`
- Optimal lines come from `userSettings.effectiveHumidityMin/Max()`
- Badge labels use `tooDry` / `tooHumid` / `optimal`
- Sub-label uses `belowHumidityFloor` / `aboveHumidityCeiling` / `withinHumidityRange`
- Empty-state icon is `💧`
- Week extremes use `driest` (lowest min) and `wettest` (highest max)
- Tooltip key is `humidityDayTooltip`

```ts
import { Component, OnDestroy, signal, computed, effect, inject } from '@angular/core';
import { Router } from '@angular/router';
import { Subscription } from 'rxjs';
import { SensorService, SensorData, HourlySensorData } from '../../core/services/sensor.service';
import { UserSettingsService } from '../../core/services/user-settings.service';
import { PageContainerComponent } from '../../shared/components/page-container/page-container.component';
import { StatusBadgeComponent, BadgeVariant } from '../../shared/components/atoms/status-badge.component';
import { TranslocoDirective, TranslocoService } from '@jsverse/transloco';

const CHART_HEIGHT_PX = 96;
const Y_AXIS_MAX = 100;

interface DayBar {
  dateStr: string;
  label: string;
  dateLabel: string;
  hasData: boolean;
  isToday: boolean;
  isFuture: boolean;
  min: number | null;
  max: number | null;
  avg: number | null;
  barBottomPx: number;
  barHeightPx: number;
  avgY: number;
  barClass: string;
  tooltip: string;
}

interface OptimalLine {
  label: string;
  y: number;
}

@Component({
  selector: 'app-humidity-insights',
  imports: [PageContainerComponent, StatusBadgeComponent, TranslocoDirective],
  template: `
    <app-page-container>
      <ng-container *transloco="let t">

      <button (click)="back()"
              class="flex items-center gap-1.5 text-[13px] text-gray-400 hover:text-gray-600 transition-colors mb-6">
        ‹ {{ t('nav.home') }}
      </button>

      <div class="mb-6">
        <h1 class="text-[18px] font-medium text-gray-800">{{ t('insights.humidityTitle') }}</h1>
        <p class="text-[11px] text-gray-400 mt-0.5">{{ t('insights.humiditySubtitle') }}</p>
      </div>

      <!-- Live reading -->
      <div class="mb-5">
        <div class="text-[11px] text-gray-400 mb-2 font-medium uppercase tracking-wide">{{ t('insights.liveReading') }}</div>
        <div class="bg-white border-[0.5px] border-gray-200 rounded-xl p-4">
          @if (liveHumidity() != null) {
            <div class="flex items-start justify-between mb-3">
              <div>
                <div class="flex items-baseline gap-1.5">
                  <span class="text-[32px] font-semibold text-gray-900 leading-none tabular-nums">
                    {{ liveHumidity()!.toFixed(1) }}
                  </span>
                  <span class="text-[14px] text-gray-400">%</span>
                </div>
                <div class="text-[12px] text-gray-400 mt-1.5">{{ readingSubLabel() }}</div>
              </div>
              <app-status-badge [label]="badgeLabel()" [variant]="badgeVariant()"
                                class="mt-1 shrink-0" />
            </div>
            <div class="text-[11px] text-gray-400 mt-3">{{ t('insights.updated') }} {{ lastSeenLabel() }}</div>
          } @else {
            <div class="flex items-center gap-3 py-2">
              <div class="w-2 h-2 rounded-full bg-gray-300 shrink-0 animate-pulse"></div>
              <span class="text-[13px] text-gray-400">{{ t('insights.waitingForData') }}</span>
            </div>
          }
        </div>
      </div>

      <!-- Today's range -->
      <div class="mb-5">
        <div class="text-[11px] text-gray-400 mb-2 font-medium uppercase tracking-wide">{{ t('insights.today') }}</div>
        <div class="bg-white border-[0.5px] border-gray-200 rounded-xl p-4">
          @if (todayStats(); as tt) {
            <div class="flex items-baseline gap-1.5 mb-1">
              <span class="text-[28px] font-semibold text-gray-900 leading-none tabular-nums">
                {{ tt.avg.toFixed(1) }}
              </span>
              <span class="text-[13px] text-gray-400">% avg</span>
            </div>
            <div class="text-[12px] text-gray-400">
              {{ t('settings.min') }} {{ tt.min.toFixed(1) }}% · {{ t('settings.max') }} {{ tt.max.toFixed(1) }}% ·
              {{ tt.hourCount === 1 ? t('insights.hourLogged', { n: tt.hourCount }) : t('insights.hoursLogged', { n: tt.hourCount }) }}
            </div>
          } @else {
            <p class="text-[13px] text-gray-400 py-1">{{ t('insights.noHourlyData') }}</p>
            <p class="text-[11px] text-gray-300 mt-0.5">{{ t('insights.hourlySnapshotsHint') }}</p>
          }
        </div>
      </div>

      <!-- Week history chart -->
      <div>
        <div class="flex items-center justify-between mb-2">
          <div class="text-[11px] text-gray-400 font-medium uppercase tracking-wide">{{ t('insights.weekHistory') }}</div>
          <div class="flex items-center gap-1">
            <button (click)="prevWeek()"
                    [disabled]="weekOffset() <= -12"
                    class="w-7 h-7 flex items-center justify-center text-gray-400 hover:text-gray-700 rounded-lg hover:bg-gray-50 transition-colors disabled:opacity-30 disabled:cursor-not-allowed text-[18px] leading-none">
              ‹
            </button>
            <span class="text-[12px] text-gray-600 min-w-[116px] text-center select-none">{{ weekLabel() }}</span>
            <button (click)="nextWeek()"
                    [disabled]="weekOffset() >= 0"
                    class="w-7 h-7 flex items-center justify-center text-gray-400 hover:text-gray-700 rounded-lg hover:bg-gray-50 transition-colors disabled:opacity-30 disabled:cursor-not-allowed text-[18px] leading-none">
              ›
            </button>
          </div>
        </div>

        <div class="bg-white border-[0.5px] border-gray-200 rounded-xl p-4">
          @if (loading()) {
            <div class="flex items-end gap-2" style="height: 96px">
              @for (h of skeletonHeights; track $index) {
                <div class="flex-1 rounded-t-lg bg-gray-100 animate-pulse" [style.height.px]="h"></div>
              }
            </div>
            <div class="flex gap-2 mt-2.5">
              @for (l of ['Mon','Tue','Wed','Thu','Fri','Sat','Sun']; track l) {
                <div class="flex-1 text-center text-[10px] text-gray-300">{{ l }}</div>
              }
            </div>
          } @else if (hasWeekData()) {
            <div class="flex">
              <div class="relative shrink-0 pr-1" style="width: 32px; height: 96px">
                <span class="absolute top-0 right-0 text-[9px] text-gray-300 leading-none">{{ yAxisLabels().top }}%</span>
                <span class="absolute top-1/2 right-0 -translate-y-1/2 text-[9px] text-gray-300 leading-none">{{ yAxisLabels().mid }}%</span>
                <span class="absolute bottom-0 right-0 text-[9px] text-gray-300 leading-none">0%</span>
              </div>
              <div class="flex-1 relative" style="height: 96px">
                <div class="absolute inset-x-0 top-0 border-t border-gray-100"></div>
                <div class="absolute inset-x-0 top-1/2 border-t border-gray-100"></div>
                <div class="absolute inset-x-0 bottom-0 border-t border-gray-100"></div>
                @for (line of optimalLines(); track line.label) {
                  <div class="absolute inset-x-0 z-10 flex items-center" [style.bottom.px]="line.y">
                    <div class="flex-1 border-t border-dashed border-gw-green/70"></div>
                    <span class="text-[8px] text-gw-green-dark pl-1 leading-none shrink-0">{{ line.label }}</span>
                  </div>
                }
                <div class="absolute inset-0 flex gap-2">
                  @for (day of chartBars(); track day.dateStr) {
                    <div class="flex-1 relative" [title]="day.tooltip">
                      @if (day.hasData) {
                        <div class="absolute left-1/2 -translate-x-1/2 w-3 rounded-md transition-all duration-500"
                             [class]="day.barClass"
                             [style.bottom.px]="day.barBottomPx"
                             [style.height.px]="day.barHeightPx">
                        </div>
                        <div class="absolute left-1/2 -translate-x-1/2 bg-white rounded-full pointer-events-none"
                             style="width: 16px; height: 2px;"
                             [style.bottom.px]="day.avgY - 1">
                        </div>
                      }
                    </div>
                  }
                </div>
              </div>
            </div>
            <div class="flex mt-2.5">
              <div style="width: 32px" class="shrink-0"></div>
              <div class="flex-1 flex gap-2">
                @for (day of chartBars(); track day.dateStr) {
                  <div class="flex-1 text-center text-[10px]"
                       [class]="day.isToday ? 'text-gw-green-dark font-semibold' : 'text-gray-400'">
                    {{ day.label }}
                  </div>
                }
              </div>
            </div>
            <div class="mt-3 pt-3 border-t border-gray-100 flex items-center justify-between flex-wrap gap-y-1">
              <span class="text-[11px] text-gray-400">{{ t('insights.weekAvg') }}</span>
              <span class="text-[12px] font-medium text-gray-700">{{ weekAvgStr() }}</span>
            </div>
            @if (weekExtremes(); as e) {
              <div class="mt-1 flex items-center justify-between text-[11px] text-gray-400">
                <span>{{ t('insights.driest') }} {{ e.dryLabel }} · {{ e.dryStr }}</span>
                <span>{{ t('insights.wettest') }} {{ e.wetLabel }} · {{ e.wetStr }}</span>
              </div>
            }
          } @else {
            <div class="py-10 text-center">
              <div class="text-3xl mb-3">💧</div>
              <p class="text-[13px] text-gray-500 font-medium">{{ t('insights.noWeekData') }}</p>
              <p class="text-[11px] text-gray-400 mt-1 leading-relaxed">
                {{ t('insights.noWeekDataHint') }}
              </p>
            </div>
          }
        </div>
      </div>

      </ng-container>
    </app-page-container>
  `,
})
export class HumidityInsightsComponent implements OnDestroy {
  private sensorService = inject(SensorService);
  private router = inject(Router);
  private userSettings = inject(UserSettingsService);
  private transloco = inject(TranslocoService);
  private localeKey = signal(this.transloco.getActiveLang());
  private weekSub?: Subscription;
  private liveSub?: Subscription;
  private tickTimer?: ReturnType<typeof setInterval>;

  latestData = signal<SensorData | null>(null);
  todayHourlyData = signal<HourlySensorData[]>([]);
  weekHourlyData = signal<HourlySensorData[]>([]);
  weekOffset = signal(0);
  loading = signal(false);
  private tick = signal(0);

  skeletonHeights = [40, 56, 48, 72, 64, 36, 24];

  // ── Live ─────────────────────────────────────────────────────────────────────

  liveHumidity = computed(() => this.latestData()?.humidity ?? null);

  badgeVariant = computed<BadgeVariant>(() => {
    const h = this.liveHumidity();
    if (h == null) return 'gray';
    if (h < this.userSettings.effectiveHumidityMin() || h > this.userSettings.effectiveHumidityMax()) return 'amber';
    return 'green';
  });

  badgeLabel = computed(() => {
    this.localeKey();
    const h = this.liveHumidity();
    if (h == null) return '';
    if (h < this.userSettings.effectiveHumidityMin()) return this.transloco.translate('insights.tooDry');
    if (h > this.userSettings.effectiveHumidityMax()) return this.transloco.translate('insights.tooHumid');
    return this.transloco.translate('insights.optimal');
  });

  readingSubLabel = computed(() => {
    this.localeKey();
    const h = this.liveHumidity();
    if (h == null) return '';
    const min = this.userSettings.effectiveHumidityMin();
    const max = this.userSettings.effectiveHumidityMax();
    if (h < min) return this.transloco.translate('insights.belowHumidityFloor', { min });
    if (h > max) return this.transloco.translate('insights.aboveHumidityCeiling', { max });
    return this.transloco.translate('insights.withinHumidityRange', { min, max });
  });

  lastSeenLabel = computed(() => {
    this.tick(); this.localeKey();
    const d = this.latestData();
    if (!d) return '—';
    const secs = Math.floor((Date.now() - new Date(d.timestamp).getTime()) / 1000);
    if (secs < 10) return this.transloco.translate('insights.justNow');
    if (secs < 60) return this.transloco.translate('insights.secondsAgo', { n: secs });
    return this.transloco.translate('insights.minutesAgo', { n: Math.floor(secs / 60) });
  });

  // ── Today's range ────────────────────────────────────────────────────────────

  todayStats = computed(() => {
    const now = new Date();
    const todayStart = new Date(now); todayStart.setHours(0, 0, 0, 0);
    const todayEnd = new Date(now); todayEnd.setHours(23, 59, 59, 999);
    const hours = this.todayHourlyData().filter(h => {
      if (h.avgHumidity == null) return false;
      const hd = new Date(h.hour);
      return hd >= todayStart && hd <= todayEnd;
    });
    if (hours.length === 0) return null;
    const avg = hours.reduce((s, h) => s + (h.avgHumidity ?? 0), 0) / hours.length;
    const min = Math.min(...hours.map(h => h.minHumidity ?? h.avgHumidity ?? Infinity));
    const max = Math.max(...hours.map(h => h.maxHumidity ?? h.avgHumidity ?? -Infinity));
    return { avg, min, max, hourCount: hours.length };
  });

  // ── Week chart ───────────────────────────────────────────────────────────────

  weekLabel = computed(() => {
    const { from, to } = this.weekBounds(this.weekOffset());
    const fmt = (d: Date) => d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short' });
    return `${fmt(from)} – ${fmt(to)}`;
  });

  private rawDayData = computed(() => {
    const { from } = this.weekBounds(this.weekOffset());
    const hourly = this.weekHourlyData();
    const today = new Date(); today.setHours(0, 0, 0, 0);
    return Array.from({ length: 7 }, (_, i) => {
      const day = new Date(from); day.setDate(from.getDate() + i);
      const dayStart = new Date(day); dayStart.setHours(0, 0, 0, 0);
      const dayEnd = new Date(day); dayEnd.setHours(23, 59, 59, 999);
      const dayHours = hourly.filter(h => {
        if (h.avgHumidity == null) return false;
        const hd = new Date(h.hour);
        return hd >= dayStart && hd <= dayEnd;
      });
      const hasData = dayHours.length > 0;
      const avg = hasData ? dayHours.reduce((s, h) => s + (h.avgHumidity ?? 0), 0) / dayHours.length : null;
      const min = hasData ? Math.min(...dayHours.map(h => h.minHumidity ?? h.avgHumidity ?? Infinity)) : null;
      const max = hasData ? Math.max(...dayHours.map(h => h.maxHumidity ?? h.avgHumidity ?? -Infinity)) : null;
      return {
        day, dayStart, hasData, avg, min, max,
        isToday: dayStart.getTime() === today.getTime(),
        isFuture: dayStart > today,
      };
    });
  });

  yAxisLabels = computed(() => ({ top: '100', mid: '50' }));

  optimalLines = computed<OptimalLine[]>(() => {
    return [this.userSettings.effectiveHumidityMin(), this.userSettings.effectiveHumidityMax()].map(v => ({
      label: `${v}%`,
      y: Math.round((v / Y_AXIS_MAX) * CHART_HEIGHT_PX),
    }));
  });

  chartBars = computed<DayBar[]>(() => {
    return this.rawDayData().map(r => {
      const valToY = (v: number) => (v / Y_AXIS_MAX) * CHART_HEIGHT_PX;
      let barBottomPx = 0, barHeightPx = 0, avgY = 0;
      let barClass = 'bg-gray-100';

      if (r.hasData && r.min != null && r.max != null && r.avg != null) {
        barBottomPx = Math.max(0, valToY(r.min));
        barHeightPx = Math.max(4, valToY(r.max) - valToY(r.min));
        avgY = valToY(r.avg);

        const withinOptimal = r.min >= this.userSettings.effectiveHumidityMin() && r.max <= this.userSettings.effectiveHumidityMax();
        const avgOutsideOptimal = r.avg < this.userSettings.effectiveHumidityMin() || r.avg > this.userSettings.effectiveHumidityMax();
        const isFaded = !r.isToday;
        if (avgOutsideOptimal) barClass = isFaded ? 'bg-gw-red/50' : 'bg-gw-red';
        else if (!withinOptimal) barClass = isFaded ? 'bg-gw-amber/50' : 'bg-gw-amber';
        else barClass = isFaded ? 'bg-gw-green/50' : 'bg-gw-green';
      }

      const tooltip = r.hasData && !r.isFuture && r.min != null && r.max != null && r.avg != null
        ? this.transloco.translate('insights.humidityDayTooltip', {
            day: r.day.toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'short' }),
            avg: r.avg.toFixed(1),
            min: r.min.toFixed(1),
            max: r.max.toFixed(1),
          })
        : r.isFuture ? this.transloco.translate('insights.upcoming') : this.transloco.translate('insights.noData');

      return {
        dateStr: r.day.toISOString().split('T')[0],
        label: r.day.toLocaleDateString('en-GB', { weekday: 'short' }).slice(0, 3),
        dateLabel: r.day.toLocaleDateString('en-GB', { day: 'numeric', month: 'short' }),
        hasData: r.hasData,
        isToday: r.isToday,
        isFuture: r.isFuture,
        min: r.min, max: r.max, avg: r.avg,
        barBottomPx, barHeightPx, avgY, barClass, tooltip,
      };
    });
  });

  hasWeekData = computed(() => this.chartBars().some(d => d.hasData && !d.isFuture));

  weekAvgStr = computed(() => {
    const days = this.chartBars().filter(d => d.hasData && d.avg != null && !d.isFuture);
    if (days.length === 0) return '—';
    const avg = days.reduce((s, d) => s + (d.avg ?? 0), 0) / days.length;
    return `${avg.toFixed(1)} %`;
  });

  weekExtremes = computed(() => {
    const days = this.chartBars().filter(d => d.hasData && !d.isFuture && d.min != null && d.max != null);
    if (days.length === 0) return null;
    const driest = days.reduce((min, d) => (d.min! < min.min! ? d : min));
    const wettest = days.reduce((max, d) => (d.max! > max.max! ? d : max));
    return {
      dryLabel: driest.label,
      dryStr: `${driest.min!.toFixed(1)} %`,
      wetLabel: wettest.label,
      wetStr: `${wettest.max!.toFixed(1)} %`,
    };
  });

  // ── Lifecycle ────────────────────────────────────────────────────────────────

  constructor() {
    this.transloco.langChanges$.subscribe(l => this.localeKey.set(l));
    this.sensorService.getHourlyData(48).subscribe(d => this.todayHourlyData.set(d));

    this.sensorService.getLatestSensorData().subscribe(d => this.latestData.set(d));
    this.liveSub = this.sensorService.subscribeToSensorData().subscribe(d => { if (d) this.latestData.set(d); });

    this.tickTimer = setInterval(() => this.tick.update(v => v + 1), 30_000);

    effect(() => {
      const offset = this.weekOffset();
      const hoursNeeded = (Math.abs(offset) + 1) * 7 * 24;

      this.weekSub?.unsubscribe();
      this.loading.set(true);
      this.weekHourlyData.set([]);

      this.weekSub = this.sensorService.getHourlyData(hoursNeeded).subscribe({
        next: data => { this.weekHourlyData.set(data); this.loading.set(false); },
        error: () => { this.weekHourlyData.set([]); this.loading.set(false); },
      });
    });
  }

  ngOnDestroy() {
    this.weekSub?.unsubscribe();
    this.liveSub?.unsubscribe();
    if (this.tickTimer) clearInterval(this.tickTimer);
  }

  back() { this.router.navigate(['/']); }
  prevWeek() { if (this.weekOffset() > -12) this.weekOffset.update(v => v - 1); }
  nextWeek() { if (this.weekOffset() < 0) this.weekOffset.update(v => v + 1); }

  private weekBounds(offset: number): { from: Date; to: Date } {
    const now = new Date();
    const dow = now.getDay();
    const daysFromMonday = dow === 0 ? 6 : dow - 1;
    const thisMonday = new Date(now);
    thisMonday.setDate(now.getDate() - daysFromMonday);
    thisMonday.setHours(0, 0, 0, 0);

    const from = new Date(thisMonday);
    from.setDate(thisMonday.getDate() + offset * 7);

    const to = new Date(from);
    to.setDate(from.getDate() + 6);
    to.setHours(23, 59, 59, 999);

    return { from, to };
  }
}
```

- [ ] **Step 2: Register the route**

In [frontend/src/app/app.routes.ts](frontend/src/app/app.routes.ts), insert a new route after the `temperature` route (line 32-35), before `digest`:

```ts
{
  path: 'humidity',
  loadComponent: () => import('./features/humidity/humidity-insights.component').then(m => m.HumidityInsightsComponent),
},
```

- [ ] **Step 3: Verify frontend type-checks**

Run: `cd frontend && npx tsc --noEmit`
Expected: No errors.

- [ ] **Step 4: Manual smoke test**

Run: `cd frontend && npm start`
Navigate to `http://localhost:4200/humidity`. Verify:
- Page renders without errors.
- Live reading card shows the latest humidity %.
- Today's range shows avg/min/max (or empty-state if no data this hour).
- Week chart renders 7 bars with dashed lines at the configured min/max.
- Prev/next week navigation works.
- Switching language updates all visible strings.

- [ ] **Step 5: Commit**

```bash
git add frontend/src/app/features/humidity/humidity-insights.component.ts frontend/src/app/app.routes.ts
git commit -m "feat: add humidity insights page and /humidity route"
```

---

## Task 6: Home — link humidity card + use configurable range

**Files:**
- Modify: [frontend/src/app/features/home/home.component.ts](frontend/src/app/features/home/home.component.ts)

- [ ] **Step 1: Add `link="/humidity"` to the home humidity card**

In [frontend/src/app/features/home/home.component.ts](frontend/src/app/features/home/home.component.ts), update the `<app-sensor-card>` block for humidity (lines 115-122):

```html
<app-sensor-card
  [label]="t('home.humidity')"
  [value]="humidValue()"
  unit="%"
  [status]="humidStatus()"
  [sparkValues]="humidSpark()"
  [rangeMin]="humidRange().min"
  [rangeMax]="humidRange().max"
  link="/humidity" />
```

- [ ] **Step 2: Switch `humidStatus` and `humidRange` to use configurable thresholds**

The `HomeComponent` already injects `UserSettingsService` (it reads temp values). If `userSettings` isn't already injected in this component, add `private userSettings = inject(UserSettingsService);` near the other `inject()` calls and import `UserSettingsService` at the top.

Replace the `humidStatus` computed (around line 359-363):

```ts
humidStatus = computed<'ok' | 'warn' | 'missing'>(() => {
  const h = this.latestData()?.humidity ?? this.hourlyData()[0]?.avgHumidity;
  if (h == null) return 'missing';
  return h < this.userSettings.effectiveHumidityMin() || h > this.userSettings.effectiveHumidityMax() ? 'warn' : 'ok';
});
```

Replace the `humidRange` computed (line 387):

```ts
humidRange = computed(() => ({
  min: `${this.userSettings.effectiveHumidityMin()}%`,
  max: `${this.userSettings.effectiveHumidityMax()}%`,
}));
```

- [ ] **Step 3: Verify frontend type-checks**

Run: `cd frontend && npx tsc --noEmit`
Expected: No errors.

- [ ] **Step 4: Manual smoke test**

Reload `http://localhost:4200/`. Verify:
- Humidity card now shows a pointer cursor on hover and a darker border.
- Clicking the card navigates to `/humidity`.
- Range labels under the sparkline show the user's configured min/max.
- Status dot (ok/warn) flips when you tighten the range in Settings.

- [ ] **Step 5: Commit**

```bash
git add frontend/src/app/features/home/home.component.ts
git commit -m "feat(home): link humidity card to /humidity and use configurable range"
```

---

## Task 7: Mood — use configurable humidity range

**Files:**
- Modify: [frontend/src/app/core/services/sensor.service.ts](frontend/src/app/core/services/sensor.service.ts)

- [ ] **Step 1: Replace the hardcoded `>= 40 && <= 80` check**

In [frontend/src/app/core/services/sensor.service.ts](frontend/src/app/core/services/sensor.service.ts), in the `getMood()` method (line 215), replace:

```ts
const humidityOk = data.humidity == null || (data.humidity >= 40 && data.humidity <= 80);
```

with:

```ts
const humidityOk = data.humidity == null
  || (data.humidity >= this.userSettings.effectiveHumidityMin()
      && data.humidity <= this.userSettings.effectiveHumidityMax());
```

(`this.userSettings` is already injected at line 85.)

- [ ] **Step 2: Verify frontend type-checks**

Run: `cd frontend && npx tsc --noEmit`
Expected: No errors.

- [ ] **Step 3: Manual smoke test**

Reload home. Verify the mood card label (e.g. "Thriving" / "Attention needed") reflects the new humidity range. Tighten the humidity range in Settings to force the live humidity outside it, then reload home — mood should switch to "Attention needed".

- [ ] **Step 4: Commit**

```bash
git add frontend/src/app/core/services/sensor.service.ts
git commit -m "feat(mood): use configurable humidity range from UserSettings"
```

---

## Final verification

- [ ] **Step 1: Full type check + build**

```bash
cd backend && npm run build
cd ../frontend && npx tsc --noEmit && npm run build
```

Expected: Both succeed with no errors.

- [ ] **Step 2: End-to-end manual test**

With both backend and frontend running:
1. Open the app, log in.
2. Home dashboard: humidity card is clickable, range labels reflect settings.
3. Click humidity card → `/humidity` page loads with live reading, today's range, week chart.
4. Settings → change humidity range to `30–60%`. Back on home, range labels under humidity sparkline update.
5. Reload `/humidity` → optimal-range dashed lines move to 30 and 60.
6. Switch language to Danish → every visible string on `/humidity` is translated.
7. Reset humidity range from Settings → values revert to 40/80.

- [ ] **Step 3: Push**

```bash
git push origin master
```
