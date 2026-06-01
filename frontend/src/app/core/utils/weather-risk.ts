export type RiskType = 'frost' | 'heat' | 'wind';
export type Severity = 'warn' | 'severe';

export interface DailyForecast {
  date: string;
  weatherCode: number;
  conditionLabel: string;
  conditionIcon: string;
  tempMin: number;
  tempMax: number;
  windMax: number;
}

export interface RiskMessage {
  type: RiskType;
  severity: Severity;
  icon: string;
  bodyKey: string;
  bodyParams: Record<string, number | string>;
  actionKey: string;
}

export interface DailyRisk {
  date: string;
  hasFrost: boolean;
  hasHeat: boolean;
  hasWind: boolean;
  severity: Severity | null;
  messages: RiskMessage[];
}

export interface Thresholds {
  frost: number;
  heat: number;
  wind: number;
}

export const SEVERE_FROST_CEILING = 0;
export const SEVERE_HEAT_FLOOR = 35;
export const SEVERE_WIND_FLOOR = 19;  // m/s — roughly former 70 km/h

const RISK_ICON: Record<RiskType, string> = {
  frost: '🥶',
  heat: '🥵',
  wind: '💨',
};

function worstSeverity(a: Severity | null, b: Severity | null): Severity | null {
  if (a === 'severe' || b === 'severe') return 'severe';
  if (a === 'warn' || b === 'warn') return 'warn';
  return null;
}

export function analyzeForecast(days: DailyForecast[], thresholds: Thresholds): DailyRisk[] {
  return (days ?? []).map(d => {
    const messages: RiskMessage[] = [];
    let severity: Severity | null = null;

    const hasFrost = d.tempMin <= thresholds.frost;
    if (hasFrost) {
      const sev: Severity = d.tempMin <= SEVERE_FROST_CEILING ? 'severe' : 'warn';
      severity = worstSeverity(severity, sev);
      messages.push({
        type: 'frost',
        severity: sev,
        icon: RISK_ICON.frost,
        bodyKey: sev === 'severe' ? 'forecast.risk.frostSevere' : 'forecast.risk.frostWarn',
        bodyParams: { min: Math.round(d.tempMin) },
        actionKey: 'forecast.action.frost',
      });
    }

    const hasHeat = d.tempMax >= thresholds.heat;
    if (hasHeat) {
      const sev: Severity = d.tempMax >= SEVERE_HEAT_FLOOR ? 'severe' : 'warn';
      severity = worstSeverity(severity, sev);
      messages.push({
        type: 'heat',
        severity: sev,
        icon: RISK_ICON.heat,
        bodyKey: sev === 'severe' ? 'forecast.risk.heatSevere' : 'forecast.risk.heatWarn',
        bodyParams: { max: Math.round(d.tempMax) },
        actionKey: 'forecast.action.heat',
      });
    }

    const hasWind = d.windMax >= thresholds.wind;
    if (hasWind) {
      const sev: Severity = d.windMax >= SEVERE_WIND_FLOOR ? 'severe' : 'warn';
      severity = worstSeverity(severity, sev);
      messages.push({
        type: 'wind',
        severity: sev,
        icon: RISK_ICON.wind,
        bodyKey: sev === 'severe' ? 'forecast.risk.windSevere' : 'forecast.risk.windWarn',
        bodyParams: { wind: Math.round(d.windMax) },
        actionKey: 'forecast.action.wind',
      });
    }

    return {
      date: d.date,
      hasFrost,
      hasHeat,
      hasWind,
      severity,
      messages,
    };
  });
}
