import dayjs from 'dayjs';
import type { PlantType } from '../services/plant.service';

/**
 * Typical greenhouse seed-to-harvest length in weeks per plant type. Used to
 * place a plant on its growth timeline. These are rough averages — the goal
 * is to give the user a sense of progress, not a precise prediction. A plant
 * past its season length is treated as mature (capped at 100%).
 */
export const SEASON_WEEKS: Record<PlantType, number> = {
  // Fruiting vegetables — longer seasons
  TOMATO: 18, PEPPER: 20, CUCUMBER: 12, ZUCCHINI: 10, EGGPLANT: 18,
  // Leafy greens — quick turnaround
  LETTUCE: 7, SPINACH: 6, KALE: 9, ARUGULA: 5, RADISH: 4,
  // Herbs — continuous harvest, but reach maturity around here
  BASIL: 12, MINT: 10, PARSLEY: 11, CILANTRO: 7, CHIVE: 10,
  OREGANO: 12, THYME: 12, ROSEMARY: 16,
  // Fruit
  STRAWBERRY: 16, GRAPES: 20, MELON: 14, WATERMELON: 14,
};

export type GrowthPhase = 'seedling' | 'growing' | 'flowering' | 'harvest' | 'mature';

export interface SeasonInfo {
  /** Week of the season, starting at 1 (clamped at totalWeeks + 1 for overdue plants). */
  week: number;
  /** Total expected weeks for this plant type. */
  totalWeeks: number;
  /** 0–1 progress through the season. 1 means harvest-ready. */
  progress: number;
  phase: GrowthPhase;
}

/** Compute season placement for a plant given its planted date and type. */
export function getSeasonInfo(plantedDate: Date, type: PlantType): SeasonInfo {
  const totalWeeks = SEASON_WEEKS[type] ?? 12;
  const weeksElapsed = Math.max(0, dayjs().diff(dayjs(plantedDate), 'week'));
  const week = Math.min(totalWeeks + 1, weeksElapsed + 1);
  const rawProgress = weeksElapsed / totalWeeks;
  const progress = Math.min(1, rawProgress);
  return { week, totalWeeks, progress, phase: phaseFor(rawProgress) };
}

function phaseFor(ratio: number): GrowthPhase {
  if (ratio >= 1) return 'mature';
  if (ratio >= 0.75) return 'harvest';
  if (ratio >= 0.55) return 'flowering';
  if (ratio >= 0.2) return 'growing';
  return 'seedling';
}
