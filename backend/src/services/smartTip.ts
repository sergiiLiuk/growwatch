import { SmartTip, PlantAction, Plant, DailyBriefing, BriefingCycle, UserSettings, AiUsage } from '../models';
import { fetchWeatherContext } from './weatherFetch';

// ── Briefing context types ──────────────────────────────────────────────────

export interface DailyForecastSnapshot {
    date: string;
    tempMin: number;
    tempMax: number;
    windMax: number;
    conditionLabel: string;
}

export interface CurrentWeatherSnapshot {
    temperature: number;
    humidity: number;
    conditionLabel: string;
    city: string;
}

export interface BriefingPlant {
    id: string;
    name: string;
    type: string;
    ageWeeks: number;
    recentActions: { type: string; daysAgo: number; note?: string }[];
}

export interface BriefingContext {
    cycle: BriefingCycle;
    locale: 'en' | 'da';
    weather: { current: CurrentWeatherSnapshot | null; forecast3d: DailyForecastSnapshot[] };
    sensors: { temperature?: number; humidity?: number; co2?: number; lightLevel?: number } | null;
    plants: BriefingPlant[];
}

export interface Briefing {
    overview: string;
    plantTips: Record<string, string>;
}

// ── Provider interface ──────────────────────────────────────────────────────

export interface LlmProvider {
    readonly source: string;
    generateBriefing(ctx: BriefingContext): Promise<Briefing>;
}

// ── StubLlmProvider ─────────────────────────────────────────────────────────
// Used when ANTHROPIC_API_KEY is absent. Returns templated text.

const STUB_OVERVIEW = (ctx: BriefingContext): string => {
    const t = ctx.sensors?.temperature;
    const h = ctx.sensors?.humidity;
    if (ctx.locale === 'da') {
        const w = ctx.weather.current ? `${ctx.weather.current.conditionLabel} ude` : 'ingen vejrdata';
        return ctx.cycle === 'morning'
            ? `God morgen! Drivhuset er ${t != null ? t.toFixed(1) + '°C' : '—'} og ${h != null ? h + '%' : '—'} fugtigt. ${w}. Plan din pasning i overensstemmelse hermed.`
            : `Aften-status: drivhuset endte på ${t != null ? t.toFixed(1) + '°C' : '—'} og ${h != null ? h + '%' : '—'} fugtigt. ${w}. Tjek planterne inden natten.`;
    }
    const w = ctx.weather.current ? `${ctx.weather.current.conditionLabel} outside` : 'no weather data';
    return ctx.cycle === 'morning'
        ? `Good morning! Greenhouse is ${t != null ? t.toFixed(1) + '°C' : '—'} and ${h != null ? h + '%' : '—'} humid. ${w}. Plan today's care accordingly.`
        : `Evening check-in: greenhouse ended at ${t != null ? t.toFixed(1) + '°C' : '—'} and ${h != null ? h + '%' : '—'} humid. ${w}. Look in on the plants before nightfall.`;
};

const STUB_PLANT_TIP = (ctx: BriefingContext, p: BriefingPlant): string => {
    const wateredDays = p.recentActions.find(a => a.type === 'water')?.daysAgo;
    if (ctx.locale === 'da') {
        return ctx.cycle === 'morning'
            ? `${p.name} (uge ${p.ageWeeks}) — ${wateredDays != null ? `vandet for ${wateredDays} dage siden. ` : ''}Tjek jordens fugtighed inden vanding.`
            : `${p.name} (uge ${p.ageWeeks}) — ${wateredDays != null ? `vandet for ${wateredDays} dage siden. ` : ''}Hold øje med blade og knopper inden natten.`;
    }
    return ctx.cycle === 'morning'
        ? `${p.name} (week ${p.ageWeeks}) — ${wateredDays != null ? `watered ${wateredDays} day(s) ago. ` : ''}Check soil moisture before watering.`
        : `${p.name} (week ${p.ageWeeks}) — ${wateredDays != null ? `watered ${wateredDays} day(s) ago. ` : ''}Watch leaves and buds before night.`;
};

export class StubLlmProvider implements LlmProvider {
    readonly source = 'stub';
    async generateBriefing(ctx: BriefingContext): Promise<Briefing> {
        const plantTips: Record<string, string> = {};
        for (const p of ctx.plants) plantTips[p.id] = STUB_PLANT_TIP(ctx, p);
        return { overview: STUB_OVERVIEW(ctx), plantTips };
    }
}

// ── SmartTipService ─────────────────────────────────────────────────────────

export class SmartTipService {
    constructor(private provider: LlmProvider) {}

    /**
     * Generate a briefing for a single user, persist the overview + per-plant
     * tips, log usage to AiUsage, and return the result. Caller chooses cycle:
     * 'morning' / 'evening' for scheduled runs, 'manual' for refresh button.
     */
    async regenerateForUser(userId: string, cycle: BriefingCycle | 'manual'): Promise<Briefing> {
        const persistCycle: BriefingCycle = cycle === 'manual' ? 'morning' : cycle;
        const ctx = await this.buildContext(userId, persistCycle);
        try {
            const briefing = await this.provider.generateBriefing(ctx);
            await this.persistBriefing(userId, persistCycle, briefing);
            await AiUsage.create({
                userId,
                cycle,
                source: this.provider.source,
                plantCount: ctx.plants.length,
                success: true,
            });
            return briefing;
        } catch (err: any) {
            await AiUsage.create({
                userId,
                cycle,
                source: this.provider.source,
                plantCount: ctx.plants.length,
                success: false,
                error: String(err?.message ?? err).slice(0, 500),
            });
            throw err;
        }
    }

    private async buildContext(userId: string, cycle: BriefingCycle): Promise<BriefingContext> {
        const settings = await UserSettings.findOne({ userId }).lean();
        const locale = (settings?.locale === 'da' ? 'da' : 'en') as 'en' | 'da';
        const location = settings?.location;

        const weather = await fetchWeatherContext(location?.lat, location?.lng, location?.city);

        const sensors = await this.latestSensors(userId);

        const plants = await Plant.find({ userId, monitored: true, archived: { $ne: true } }).sort({ createdAt: 1 }).lean();
        const briefingPlants: BriefingPlant[] = [];
        const now = Date.now();
        for (const p of plants) {
            const actions = await PlantAction.find({ plantId: p._id.toString(), userId }).sort({ createdAt: -1 }).limit(10).lean();
            const raw: any = p.plantedDate;
            const plantedMs = raw instanceof Date ? raw.getTime()
                : raw && typeof raw === 'object' && '$date' in raw ? new Date(raw.$date).getTime()
                : new Date(raw).getTime();
            const safePlantedMs = isNaN(plantedMs) ? now : plantedMs;
            const ageWeeks = Math.max(1, Math.floor((now - safePlantedMs) / (7 * 24 * 60 * 60 * 1000)));
            briefingPlants.push({
                id: p._id.toString(),
                name: p.name,
                type: p.type,
                ageWeeks,
                recentActions: actions.map((a: any) => ({
                    type: a.type,
                    daysAgo: Math.floor((now - new Date(a.createdAt).getTime()) / (24 * 60 * 60 * 1000)),
                    note: a.note,
                })),
            });
        }

        return { cycle, locale, weather, sensors, plants: briefingPlants };
    }

    private async latestSensors(userId: string): Promise<BriefingContext['sensors']> {
        // Access the in-memory sensor store via a lazy import to avoid circular deps.
        const { getLatestForUser } = await import('../sensorStore');
        const latest = getLatestForUser(userId);
        if (!latest) return null;
        return {
            temperature: latest.temperature,
            humidity: latest.humidity,
            co2: latest.co2,
            lightLevel: latest.lightLevel,
        };
    }

    private async persistBriefing(userId: string, cycle: BriefingCycle, briefing: Briefing): Promise<void> {
        const now = new Date();
        const source = this.provider.source;
        await DailyBriefing.findOneAndUpdate(
            { userId },
            { $set: { cycle, overview: briefing.overview, source, generatedAt: now } },
            { upsert: true }
        );
        for (const [plantId, text] of Object.entries(briefing.plantTips)) {
            await SmartTip.findOneAndUpdate(
                { userId, plantId },
                { $set: { text, source, cycle, generatedAt: now }, $setOnInsert: { userId, plantId } },
                { upsert: true }
            );
        }
    }
}
