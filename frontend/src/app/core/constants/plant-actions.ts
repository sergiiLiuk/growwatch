import type { PlantActionType } from '../services/plant-action.service';

/**
 * Single source of truth for plant-action UI metadata. Anywhere in the app
 * that needs an emoji, label, color, or past-tense form for an action type
 * should import from here — never inline `{ water: '💧', ... }`.
 */
export interface PlantActionMeta {
  type: PlantActionType;
  emoji: string;
  /** Translation key for the verb form ("Water", "Fertilize"). */
  labelKey: string;
  /** Translation key for the past-tense form ("Watered", "Fertilized"). Null for `note`. */
  pastTenseKey: string | null;
  /** Tailwind class applied to the action button when it's the most-recent action. */
  activeClass: string;
  /** Tailwind background class for the small icon bubble in history rows. */
  iconBg: string;
}

export const PLANT_ACTION_META: Record<PlantActionType, PlantActionMeta> = {
  water:     { type: 'water',     emoji: '💧', labelKey: 'plantDetail.action.water',     pastTenseKey: 'plantDetail.history.watered',    activeClass: 'border-red-200 bg-red-50/60',                   iconBg: 'bg-red-50' },
  fertilize: { type: 'fertilize', emoji: '🌱', labelKey: 'plantDetail.action.fertilize', pastTenseKey: 'plantDetail.history.fertilized', activeClass: 'border-gw-green-light bg-gw-green-light/30',    iconBg: 'bg-gw-green-light' },
  prune:     { type: 'prune',     emoji: '✂️', labelKey: 'plantDetail.action.prune',     pastTenseKey: 'plantDetail.history.pruned',     activeClass: 'border-pink-200 bg-pink-50/60',                 iconBg: 'bg-pink-50' },
  harvest:   { type: 'harvest',   emoji: '🍅', labelKey: 'plantDetail.action.harvest',   pastTenseKey: 'plantDetail.history.harvested',  activeClass: 'border-orange-200 bg-orange-50/60',             iconBg: 'bg-orange-50' },
  bloom:     { type: 'bloom',     emoji: '🌸', labelKey: 'plantDetail.action.bloom',     pastTenseKey: 'plantDetail.history.bloomed',    activeClass: 'border-rose-200 bg-rose-50/60',                 iconBg: 'bg-rose-50' },
  note:      { type: 'note',      emoji: '📝', labelKey: 'plantDetail.action.note',      pastTenseKey: null,                              activeClass: 'border-amber-200 bg-amber-50/60',               iconBg: 'bg-amber-50' },
};

/** Canonical display order used by action grids, quick-log sheet, etc. */
export const PLANT_ACTION_ORDER: PlantActionType[] = ['water', 'fertilize', 'prune', 'harvest', 'bloom', 'note'];

/** Array of all action meta in canonical order — handy for `@for` loops. */
export const PLANT_ACTIONS: PlantActionMeta[] = PLANT_ACTION_ORDER.map(t => PLANT_ACTION_META[t]);
