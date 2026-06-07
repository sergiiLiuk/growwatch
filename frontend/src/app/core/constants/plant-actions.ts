import type { PlantActionType } from '../services/plant-action.service';
import type { IconName } from '../../shared/components/atoms/icon.component';

/**
 * Single source of truth for plant-action UI metadata. Anywhere in the app
 * that needs an icon, label, color, or past-tense form for an action type
 * should import from here — never inline `{ water: '💧', ... }`.
 */
export interface PlantActionMeta {
  type: PlantActionType;
  emoji: string;
  /** Line icon name from the central icon registry. */
  icon: IconName;
  /** Translation key for the verb form ("Water", "Fertilize"). */
  labelKey: string;
  /** Translation key for the past-tense form ("Watered", "Fertilized"). Null for `note`. */
  pastTenseKey: string | null;
  /** Tailwind class applied to the action button when it's the most-recent action. */
  activeClass: string;
  /** Tailwind background class for the small icon bubble in history rows. */
  iconBg: string;
  /** Tailwind text color for the icon inside the bubble. */
  iconFg: string;
}

export const PLANT_ACTION_META: Record<PlantActionType, PlantActionMeta> = {
  water:     { type: 'water',     emoji: '💧', icon: 'droplet',   labelKey: 'plantDetail.action.water',     pastTenseKey: 'plantDetail.history.watered',    activeClass: 'border-blue-200 bg-blue-50/60',                iconBg: 'bg-blue-50',         iconFg: 'text-blue-500'      },
  fertilize: { type: 'fertilize', emoji: '🌱', icon: 'sprout',    labelKey: 'plantDetail.action.fertilize', pastTenseKey: 'plantDetail.history.fertilized', activeClass: 'border-gw-green-light bg-gw-green-light/30',    iconBg: 'bg-gw-green-light',  iconFg: 'text-gw-green-dark' },
  prune:     { type: 'prune',     emoji: '✂️', icon: 'scissors',  labelKey: 'plantDetail.action.prune',     pastTenseKey: 'plantDetail.history.pruned',     activeClass: 'border-pink-200 bg-pink-50/60',                iconBg: 'bg-pink-50',         iconFg: 'text-pink-500'      },
  harvest:   { type: 'harvest',   emoji: '🍅', icon: 'basket',    labelKey: 'plantDetail.action.harvest',   pastTenseKey: 'plantDetail.history.harvested',  activeClass: 'border-orange-200 bg-orange-50/60',            iconBg: 'bg-orange-50',       iconFg: 'text-orange-500'    },
  bloom:     { type: 'bloom',     emoji: '🌸', icon: 'flower',    labelKey: 'plantDetail.action.bloom',     pastTenseKey: 'plantDetail.history.bloomed',    activeClass: 'border-rose-200 bg-rose-50/60',                iconBg: 'bg-rose-50',         iconFg: 'text-rose-500'      },
  note:      { type: 'note',      emoji: '📝', icon: 'note',      labelKey: 'plantDetail.action.note',      pastTenseKey: null,                              activeClass: 'border-amber-200 bg-amber-50/60',              iconBg: 'bg-amber-50',        iconFg: 'text-amber-600'     },
};

/** Canonical display order used by action grids, quick-log sheet, etc. */
export const PLANT_ACTION_ORDER: PlantActionType[] = ['water', 'fertilize', 'prune', 'harvest', 'bloom', 'note'];

/** Array of all action meta in canonical order — handy for `@for` loops. */
export const PLANT_ACTIONS: PlantActionMeta[] = PLANT_ACTION_ORDER.map(t => PLANT_ACTION_META[t]);
