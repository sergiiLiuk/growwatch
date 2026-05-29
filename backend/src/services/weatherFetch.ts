import type { CurrentWeatherSnapshot, DailyForecastSnapshot } from './smartTip';

function weatherLabel(code: number): string {
    if (code === 0) return 'Clear sky';
    if (code === 1) return 'Mainly clear';
    if (code === 2) return 'Partly cloudy';
    if (code === 3) return 'Overcast';
    if (code <= 48) return 'Foggy';
    if (code <= 55) return 'Drizzle';
    if (code <= 65) return 'Rain';
    if (code <= 77) return 'Snow';
    if (code <= 82) return 'Rain showers';
    if (code <= 86) return 'Snow showers';
    return 'Thunderstorm';
}

const DEFAULT_LAT = 55.68;
const DEFAULT_LNG = 12.57;

export async function fetchWeatherContext(
    lat?: number,
    lng?: number,
    city?: string,
): Promise<{ current: CurrentWeatherSnapshot | null; forecast3d: DailyForecastSnapshot[] }> {
    const la = typeof lat === 'number' ? lat : DEFAULT_LAT;
    const ln = typeof lng === 'number' ? lng : DEFAULT_LNG;
    try {
        const url = `https://api.open-meteo.com/v1/forecast?latitude=${la}&longitude=${ln}` +
            `&current=temperature_2m,relative_humidity_2m,weather_code` +
            `&daily=temperature_2m_min,temperature_2m_max,wind_speed_10m_max,weather_code` +
            `&forecast_days=3&timezone=auto`;
        const res = await fetch(url);
        const data: any = await res.json();
        const c = data.current;
        const current: CurrentWeatherSnapshot | null = c ? {
            temperature: Math.round(c.temperature_2m),
            humidity: Math.round(c.relative_humidity_2m),
            conditionLabel: weatherLabel(c.weather_code),
            city: city ?? 'Unknown',
        } : null;
        const forecast3d: DailyForecastSnapshot[] = (data.daily?.time ?? []).map((date: string, i: number) => ({
            date,
            tempMin: data.daily.temperature_2m_min[i],
            tempMax: data.daily.temperature_2m_max[i],
            windMax: data.daily.wind_speed_10m_max[i],
            conditionLabel: weatherLabel(data.daily.weather_code[i]),
        }));
        return { current, forecast3d };
    } catch (err) {
        console.error('Weather fetch failed for briefing:', err);
        return { current: null, forecast3d: [] };
    }
}
