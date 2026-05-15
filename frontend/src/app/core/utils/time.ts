export function isNight(): boolean {
  const h = new Date().getHours();
  return h >= 21 || h < 6;
}

export function isDawnOrDusk(): boolean {
  const h = new Date().getHours();
  return (h >= 6 && h < 9) || (h >= 18 && h < 21);
}

export function isOffPeak(): boolean {
  return isNight() || isDawnOrDusk();
}
