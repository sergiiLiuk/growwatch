const DAWN_BEFORE_MIN = 45;
const DAWN_AFTER_MIN  = 60;
const DUSK_BEFORE_MIN = 60;
const DUSK_AFTER_MIN  = 45;

function parseSolar(sunrise?: string, sunset?: string): { rise: Date; set: Date } | null {
  if (!sunrise || !sunset) return null;
  const rise = new Date(sunrise);
  const set  = new Date(sunset);
  if (isNaN(rise.getTime()) || isNaN(set.getTime())) return null;
  return { rise, set };
}

export function isNight(sunrise?: string, sunset?: string): boolean {
  const now = new Date();
  const solar = parseSolar(sunrise, sunset);
  if (solar) {
    const dawn = new Date(solar.rise.getTime() - DAWN_BEFORE_MIN * 60_000);
    const dusk = new Date(solar.set.getTime()  + DUSK_AFTER_MIN  * 60_000);
    return now < dawn || now > dusk;
  }
  const h = now.getHours();
  return h >= 21 || h < 6;
}

export function isDawnOrDusk(sunrise?: string, sunset?: string): boolean {
  const now = new Date();
  const solar = parseSolar(sunrise, sunset);
  if (solar) {
    const dawnStart = new Date(solar.rise.getTime() - DAWN_BEFORE_MIN * 60_000);
    const dawnEnd   = new Date(solar.rise.getTime() + DAWN_AFTER_MIN  * 60_000);
    const duskStart = new Date(solar.set.getTime()  - DUSK_BEFORE_MIN * 60_000);
    const duskEnd   = new Date(solar.set.getTime()  + DUSK_AFTER_MIN  * 60_000);
    return (now >= dawnStart && now <= dawnEnd) || (now >= duskStart && now <= duskEnd);
  }
  const h = now.getHours();
  return (h >= 6 && h < 9) || (h >= 18 && h < 21);
}

export function isOffPeak(sunrise?: string, sunset?: string): boolean {
  return isNight(sunrise, sunset) || isDawnOrDusk(sunrise, sunset);
}
