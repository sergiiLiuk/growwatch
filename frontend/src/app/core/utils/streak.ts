import dayjs from 'dayjs';

/**
 * Consecutive-day count of plant care across the whole greenhouse. Looks at
 * action dates only — type can be any (water, fertilize, prune, …). Starting
 * point is today if there was any care today, otherwise yesterday (so the
 * streak survives until the user has actually missed a full day).
 *
 * Returns 0 when there is no care in the last 48h.
 */
export function calculateStreak(actionDates: ReadonlyArray<Date | string>): number {
  if (actionDates.length === 0) return 0;
  const days = new Set<string>();
  for (const d of actionDates) {
    const key = dayjs(d).format('YYYY-MM-DD');
    days.add(key);
  }

  const today = dayjs().startOf('day');
  let cursor = today;
  if (!days.has(cursor.format('YYYY-MM-DD'))) {
    cursor = cursor.subtract(1, 'day');
    if (!days.has(cursor.format('YYYY-MM-DD'))) return 0;
  }

  let count = 0;
  while (days.has(cursor.format('YYYY-MM-DD'))) {
    count++;
    cursor = cursor.subtract(1, 'day');
  }
  return count;
}
