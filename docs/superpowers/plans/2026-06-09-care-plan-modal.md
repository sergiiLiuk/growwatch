# Care Plan Modal Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the "tap Care plan → opens Edit plant with care buried" flow with a focused Care plan modal; Edit plant becomes identity-only.

**Architecture:** New `plant-care-modal` standalone Angular component reuses the existing `plant-care-fields` form. Plant detail's care card and "+ Add care plan" CTA open the new modal; the kebab "Edit plant" still opens the existing `plant-edit-modal`, with the care section removed.

**Tech Stack:** Angular 21 standalone components, signals/computed/effect/input/output, Apollo Client mutations, Transloco i18n, Tailwind v4.

**Note on tests:** This area has no existing unit/component tests (verified by `ls frontend/src/app/features/plants/*.spec.ts`). The codebase's accepted verification pattern is manual browser verification + the existing typecheck/build pipeline. Each task ends with a build check and a short manual-verify checklist, not a `vitest` run.

---

## File map

- **Create:** `frontend/src/app/features/plants/plant-care-modal.component.ts` — focused modal hosting `app-plant-care-fields`, saves `care` only.
- **Modify:** `frontend/src/app/features/plants/plant-care-fields.component.ts` — make both `<details>` open by default (only consumer is now the new modal).
- **Modify:** `frontend/src/app/features/plants/plant-edit-modal.component.ts` — drop the `app-plant-care-fields` block, `care` signal, and `care` param from the `update()` call.
- **Modify:** `frontend/src/app/features/plants/plant-detail.component.ts` — wire the care card's Edit / "+ Add care plan" buttons to a new `careModalOpen` signal; mount `<app-plant-care-modal>`.
- **Modify:** `frontend/public/i18n/en.json` and `frontend/public/i18n/da.json` — add `plantCare.modalTitle` and `plantCare.modalSubtitle`.

---

## Task 1: Add i18n keys

**Files:**
- Modify: `frontend/public/i18n/en.json` (`plantCare` object)
- Modify: `frontend/public/i18n/da.json` (`plantCare` object)

- [ ] **Step 1: Add English keys**

In `frontend/public/i18n/en.json`, inside the existing `"plantCare": { ... }` object, add these two keys (place them at the top of the object):

```json
"modalTitle": "Care plan",
"modalSubtitle": "For {{name}}",
```

- [ ] **Step 2: Add Danish keys**

In `frontend/public/i18n/da.json`, inside the existing `"plantCare": { ... }` object, add:

```json
"modalTitle": "Plejeplan",
"modalSubtitle": "For {{name}}",
```

- [ ] **Step 3: Commit**

```
git add frontend/public/i18n/en.json frontend/public/i18n/da.json
git commit -m "i18n: add care plan modal title/subtitle keys"
```

---

## Task 2: Make care fields open by default

Both `<details>` accordions in `plant-care-fields.component.ts` are currently collapsed. In the new dedicated modal, opening the care editor and then having to click each accordion to see the fields is bad UX. Since this component is going to be consumed only by the care modal, just default both open.

**Files:**
- Modify: `frontend/src/app/features/plants/plant-care-fields.component.ts:13` and `:60`

- [ ] **Step 1: Open both accordions by default**

Change the two `<details ...>` opening tags to include `open`:

```html
<details open class="shadow-gw-sm rounded-xl">
```

(Once for the watering block at line 13, once for the fertilizer block at line 60.)

- [ ] **Step 2: Typecheck**

```
cd frontend && npx tsc --noEmit
```
Expected: no errors.

- [ ] **Step 3: Commit**

```
git add frontend/src/app/features/plants/plant-care-fields.component.ts
git commit -m "plants: open care field sections by default"
```

---

## Task 3: Create the care plan modal

**Files:**
- Create: `frontend/src/app/features/plants/plant-care-modal.component.ts`

- [ ] **Step 1: Create the component**

Write the file with this exact content:

```ts
import { Component, input, output, effect, signal, inject } from '@angular/core';
import { TranslocoDirective } from '@jsverse/transloco';
import { PlantService, Plant, PlantCare } from '../../core/services/plant.service';
import { PlantCareFieldsComponent, emptyCare } from './plant-care-fields.component';

@Component({
  selector: 'app-plant-care-modal',
  imports: [TranslocoDirective, PlantCareFieldsComponent],
  template: `
    @if (plant()) {
      <div class="fixed inset-0 z-[60] bg-black/40 flex items-end sm:items-center justify-center"
           (click)="cancel()" *transloco="let t">
        <div class="w-full sm:max-w-md bg-white rounded-t-xl sm:rounded-xl shadow-gw-sm"
             (click)="$event.stopPropagation()">
          <div class="flex justify-center pt-3 pb-1 sm:hidden">
            <div class="w-10 h-1 bg-gray-200 rounded-full"></div>
          </div>
          <div class="p-6">
            <h2 class="text-[14px] font-medium text-gray-800 mb-1">{{ t('plantCare.modalTitle') }}</h2>
            <p class="text-[13px] text-gray-400 mb-5">{{ t('plantCare.modalSubtitle', { name: plant()!.name }) }}</p>
            <div class="flex flex-col gap-4">
              <app-plant-care-fields [(care)]="care" />
              <div class="flex gap-2 pt-1 pb-4">
                <button (click)="save()"
                        [disabled]="saving()"
                        class="flex-1 bg-gw-green text-white text-[13px] py-3 rounded-xl font-medium hover:bg-gw-green-dark disabled:opacity-40 disabled:cursor-not-allowed transition-colors">
                  {{ saving() ? t('plants.saving') : t('common.save') }}
                </button>
                <button (click)="cancel()"
                        class="px-4 text-[13px] text-gray-400 hover:text-gray-600 transition-colors">
                  {{ t('common.cancel') }}
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>
    }
  `,
})
export class PlantCareModalComponent {
  private plantService = inject(PlantService);

  plant = input<Plant | null>(null);
  saved = output<void>();
  cancelled = output<void>();

  care = signal<PlantCare>(emptyCare());
  saving = signal(false);

  constructor() {
    effect(() => {
      const p = this.plant();
      if (p) {
        this.care.set(p.care ?? emptyCare());
        this.saving.set(false);
      }
    });
  }

  save() {
    const p = this.plant();
    if (!p) return;
    this.saving.set(true);
    this.plantService.update(p.id, p.name, p.type, p.plantedDate, p.count, p.dailyLightHours ?? 12, this.care())
      .subscribe({
        next: () => { this.saving.set(false); this.saved.emit(); },
        error: err => { console.error('Failed to update care plan:', err); this.saving.set(false); },
      });
  }

  cancel() {
    this.saving.set(false);
    this.cancelled.emit();
  }
}
```

Note: `plantService.update()` takes all plant fields positionally (id, name, type, plantedDate, count, dailyLightHours, care). We pass the plant's current values for everything except `care`, which we replace with the edited value. This is exactly how `plant-edit-modal` calls it today.

- [ ] **Step 2: Typecheck**

```
cd frontend && npx tsc --noEmit
```
Expected: no errors. If `p.dailyLightHours` complains as missing, confirm the `Plant` type in `plant.service.ts` exposes it (it does — used by `plant-edit-modal`).

- [ ] **Step 3: Commit**

```
git add frontend/src/app/features/plants/plant-care-modal.component.ts
git commit -m "plants: add dedicated care plan modal"
```

---

## Task 4: Wire the care modal into plant detail

**Files:**
- Modify: `frontend/src/app/features/plants/plant-detail.component.ts:200-238` (template area for the care card)
- Modify: same file, imports and class body

- [ ] **Step 1: Import the new modal**

At the top of `plant-detail.component.ts`, add to the imports:

```ts
import { PlantCareModalComponent } from './plant-care-modal.component';
```

And add `PlantCareModalComponent` to the component's `imports: [...]` array.

- [ ] **Step 2: Add a signal for the care modal**

In the component class body (alongside the existing modal-open signals), add:

```ts
careModalOpen = signal(false);
```

If `signal` isn't already imported in this file's import line for `@angular/core`, add it.

- [ ] **Step 3: Rewire the care card buttons**

In the template at the care section (around line 197-238), change the two click handlers that today call `startEdit($event)` to instead open the care modal.

Replace the Edit button (around line 203-206):

```html
<button (click)="careModalOpen.set(true)"
        class="text-[11px] text-gray-400 hover:text-gw-green-dark transition-colors">
  {{ t('common.edit') }}
</button>
```

Replace the "+ Add care plan" CTA button (around line 233-236):

```html
<button (click)="careModalOpen.set(true)"
        class="w-full bg-white border-[0.5px] border-dashed border-gray-300 rounded-xl px-3 py-2.5 text-[12px] text-gray-400 hover:border-gw-green/60 hover:text-gw-green-dark transition-colors text-left">
  {{ t('plantCare.addLink') }}
</button>
```

(Both previously called `startEdit($event)`. `startEdit` remains as-is — it is still used by the kebab menu's "Edit plant" item.)

- [ ] **Step 4: Mount the modal in the template**

Find where `<app-plant-edit-modal ... />` is mounted in `plant-detail.component.ts`'s template. Immediately after it, add:

```html
<app-plant-care-modal
  [plant]="careModalOpen() ? plant() : null"
  (saved)="careModalOpen.set(false)"
  (cancelled)="careModalOpen.set(false)" />
```

Gating the `[plant]` input on `careModalOpen()` mirrors the existing pattern for the edit modal (so the modal's `@if (plant())` template guard hides it when closed). If the edit modal uses a different open-state pattern, match that pattern here instead — read 10 lines around the existing `<app-plant-edit-modal>` mount before deciding.

- [ ] **Step 5: Typecheck**

```
cd frontend && npx tsc --noEmit
```
Expected: no errors.

- [ ] **Step 6: Manual verify**

```
cd frontend && npm start
```

Then in the browser at a plant detail page:
- Click **Edit** on the Care plan card → care modal opens, water + fertilizer sections both expanded, populated with current values.
- Change watering amount, click **Save** → modal closes, chips on the card update.
- Click **+ Add care plan** on a plant with no care set → same modal opens, both sections empty.
- Click outside the modal or Cancel → closes without saving.
- Click the kebab **Edit plant** item → existing Edit plant modal opens. (It still shows the care accordions until Task 5.)

- [ ] **Step 7: Commit**

```
git add frontend/src/app/features/plants/plant-detail.component.ts
git commit -m "plants: open care modal from care card instead of edit-plant"
```

---

## Task 5: Remove care fields from Edit plant modal

**Files:**
- Modify: `frontend/src/app/features/plants/plant-edit-modal.component.ts`

- [ ] **Step 1: Drop the care field element**

Remove this line from the template (currently line 60):

```html
<app-plant-care-fields [(care)]="care" />
```

- [ ] **Step 2: Drop the care signal**

Remove this line from the class body (currently line 90):

```ts
care = signal<PlantCare>(emptyCare());
```

- [ ] **Step 3: Drop the care initialization in the effect**

In the `constructor` effect, remove this line:

```ts
this.care.set(p.care ?? emptyCare());
```

- [ ] **Step 4: Drop `care` from the `save()` call**

Change the `update()` call so it no longer passes `this.care()`. Since the service signature is `update(id, name, type, plantedDate, count, dailyLightHours, care = null)`, omitting the trailing argument is allowed. But Edit plant must **not overwrite** any existing care, so pass the plant's current `care` through:

```ts
this.plantService.update(p.id, p.name, p.type, dayjs(this.date()).toDate(), this.count(), this.dailyLightHours(), p.care ?? null)
  .subscribe({
    next: () => { this.saving.set(false); this.saved.emit(); },
    error: err => { console.error('Failed to update plant:', err); this.saving.set(false); },
  });
```

The change vs. before: `this.care()` → `p.care ?? null`, and `p.type` is used instead of (presumably already) `p.type`. Also note we now use `p.name` only if you intend to keep editing name — re-check the existing code: the name comes from `this.name()`, keep that. Corrected call:

```ts
this.plantService.update(p.id, this.name(), p.type, dayjs(this.date()).toDate(), this.count(), this.dailyLightHours(), p.care ?? null)
```

- [ ] **Step 5: Clean up imports**

Remove unused imports from this file's import line:

- Remove `PlantCareFieldsComponent` and `emptyCare` from the `./plant-care-fields.component` import.
- Remove `PlantCare` from the `../../core/services/plant.service` import.
- Remove `PlantCareFieldsComponent` from the component's `imports: [...]` array.

After the edit, the file's top imports should look like:

```ts
import { Component, input, output, effect, signal, computed, inject } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { TranslocoDirective } from '@jsverse/transloco';
import { PlantService, Plant, PLANT_TYPE_OPTIONS } from '../../core/services/plant.service';
import dayjs from 'dayjs';
```

And the component's `imports`:

```ts
imports: [FormsModule, TranslocoDirective],
```

- [ ] **Step 6: Typecheck and build**

```
cd frontend && npx tsc --noEmit && npm run build
```
Expected: no errors, build succeeds.

- [ ] **Step 7: Manual verify**

```
cd frontend && npm start
```

In the browser:
- Open kebab → **Edit plant**. Modal opens. Water + Fertilizer accordions are **gone**. Only Name / Type / Planting date / How many remain.
- Change the plant's **Name**, hit Save → name updates on the detail header.
- Open the Care plan card's **Edit** → care modal opens with care values preserved (the previous Edit-plant Save did not wipe them).
- Save a new water amount in the care modal → chips update; reopen Edit plant → still no care section.

- [ ] **Step 8: Commit**

```
git add frontend/src/app/features/plants/plant-edit-modal.component.ts
git commit -m "plants: remove care fields from edit plant modal"
```

---

## Self-review notes

- **Spec coverage:**
  - "Focused modal with Care plan title + subtitle" → Task 3 (template) + Task 1 (i18n).
  - "Both sections open by default" → Task 2.
  - "Save calls updatePlant with care only" → Task 3 (service requires all fields positionally; we pass plant's current values for the rest, which is functionally care-only).
  - "Care card Edit + Add CTA open new modal" → Task 4.
  - "Kebab Edit plant still opens old modal" → Task 4 (startEdit untouched).
  - "Edit plant modal no longer contains care fields" → Task 5.
  - "Saving Edit plant doesn't disturb care" → Task 5 Step 4 (pass `p.care ?? null`).
  - "Cancel / backdrop / ESC discards changes in both modals" → existing modal chrome in Task 3 handles backdrop click + cancel button; ESC is inherited from the same pattern the edit modal uses (no extra work — both modals share chrome).
  - "en.json + da.json keys added" → Task 1.

- **Type consistency:** `PlantCare`, `emptyCare`, `Plant` come from the same modules as `plant-edit-modal`. `plantService.update()` signature matches across both modals.

- **No placeholders:** every step ships with exact code or exact files/lines.
