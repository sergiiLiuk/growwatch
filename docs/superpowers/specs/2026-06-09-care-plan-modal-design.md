# Dedicated Care Plan Editor — Design

## Problem

On the plant detail page, the "Care plan" card shows water/fertilizer reference chips. Tapping its **Edit** link (or the "+ Add care plan" CTA when empty) opens the full **Edit plant** modal, where Watering and Fertilizer are two collapsed `<details>` accordions at the bottom — below name, type, planting date, and plant count. The care fields are buried inside an identity editor.

## Goal

Give the care plan its own focused editor. Edit plant goes back to being about plant identity.

## Out of scope

- Changing the `PlantCare` data shape.
- Linking the care plan to reminders or history (e.g. auto-creating a water reminder from "twice a week"). The current request is only about the surface; behavioural integration is a separate spec.
- Archive, quick-log, or notes flows.

## Components

### New: `plant-care-modal.component.ts`

Focused modal, same chrome as `plant-edit-modal` (centered card, `shadow-gw-lg`, backdrop, ESC + backdrop-click to close).

- **Header:** `t('plantCare.modalTitle')` ("Care plan"), subtitle `t('plantCare.modalSubtitle', { name })` ("For *{plant name}*").
- **Body:** existing `<app-plant-care-fields>` component, reused unchanged. Both `<details>` sections open by default in this surface (the whole reason the modal opened).
- **Footer:** primary "Save" + ghost "Cancel". Reuses `common.save` / `common.cancel`.
- **Persistence:** calls `plantService.updatePlant(plant.id, { care })`. Care is the only field in the payload. Server already accepts partial updates.
- **Inputs:** `plant: input.required<Plant>()`.
- **Outputs:** `close = output<void>()`, `saved = output<void>()`.

### Modified: `plant-detail.component.ts`

- Add `careModalOpen = signal(false)` and `openCareModal()` / `closeCareModal()`.
- The Care plan card's **Edit** button and the "+ Add care plan" CTA call `openCareModal()` instead of the existing `startEdit($event)` (which opens Edit plant).
- The kebab menu's "Edit plant" item continues to call `startEdit($event)` → existing `plant-edit-modal`.
- Template adds `<app-plant-care-modal>` alongside the existing `<app-plant-edit-modal>`, conditional on `careModalOpen()`.

### Modified: `plant-edit-modal.component.ts`

- Remove the `<app-plant-care-fields>` element and its `[(care)]` binding.
- Remove the `care` signal from the component.
- The `updatePlant` payload no longer includes `care`.
- Imports cleaned up (no longer imports `PlantCareFieldsComponent` or `emptyCare`).

### Unchanged: `plant-care-fields.component.ts`

Still defines water/fertilizer fields; just consumed only by the new care modal now.

## Data flow

```
Plant detail page
 ├─ kebab "Edit plant"      → plant-edit-modal     → updatePlant({ name, type?, plantedAt, count })
 └─ Care plan card "Edit"   → plant-care-modal     → updatePlant({ care })
    (or "+ Add care plan")
```

Both modals refresh the same `PlantService` cache on save (existing behaviour).

## i18n

Add to both `frontend/public/i18n/en.json` and `frontend/public/i18n/da.json` under `plantCare`:

- `modalTitle`: "Care plan" / "Plejeplan"
- `modalSubtitle`: "For {{name}}" / "For {{name}}"

Existing keys (`waterTitle`, `fertilizerTitle`, `amount.*`, `freq.*`, etc.) are reused as-is.

## Success criteria

- Tapping **Edit** on the Care plan card opens the new modal showing only water + fertilizer fields, both sections expanded.
- Tapping **+ Add care plan** (empty state) opens the same modal.
- Tapping the kebab's **Edit plant** opens the existing Edit plant modal, which no longer contains any care fields.
- Saving the care modal persists `care` and updates the chips on the card. Saving Edit plant persists identity fields without disturbing `care`.
- Cancel / backdrop / ESC discards changes in both modals.
- All visible strings are translated in `en.json` and `da.json`.
