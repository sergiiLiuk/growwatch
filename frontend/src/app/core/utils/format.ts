/** Format a temperature reading in °C. Null/undefined → em-dash. */
export function formatTemp(value: number | null | undefined, digits = 1): string {
  return value == null ? '—' : `${value.toFixed(digits)}°C`;
}

/** Format a humidity reading as %. Null/undefined → em-dash. */
export function formatHumidity(value: number | null | undefined, digits = 1): string {
  return value == null ? '—' : `${value.toFixed(digits)}%`;
}
