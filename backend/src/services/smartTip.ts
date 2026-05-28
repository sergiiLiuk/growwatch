import { SmartTip, PlantAction, Plant } from '../models';

export interface TipContext {
    plant: { type: string; name: string; plantedDate: Date; ageWeeks: number };
    latestReading: { temperature?: number; humidity?: number; lightLevel?: number } | null;
    recentActions: { type: string; daysAgo: number }[];
    locale: 'en' | 'da';
}

export interface LlmProvider {
    readonly source: string;
    generate(context: TipContext): Promise<string>;
}

// Templated tips per plant type. Keys default to TOMATO when unknown.
const STUB_TEMPLATES_EN: Record<string, (ctx: TipContext) => string> = {
    TOMATO: (c) => `Tomatoes in week ${c.plant.ageWeeks} often need staking and side-shoot pinching. Humidity is ${c.latestReading?.humidity ?? '—'}% today — watch for early blight if it stays above 80%.`,
    PEPPER: (c) => `Peppers in week ${c.plant.ageWeeks} benefit from a calcium-rich feed. Keep humidity steady around 60% to avoid blossom drop.`,
    CUCUMBER: (c) => `Cucumbers in week ${c.plant.ageWeeks} are heavy drinkers — keep soil consistently moist. Train new vines to the trellis weekly.`,
    LETTUCE: (c) => `Lettuce in week ${c.plant.ageWeeks} prefers cool roots — mulch the bed and water in the morning.`,
    BASIL: (c) => `Pinch basil tips above the second leaf pair to keep it bushy. Don't let it flower yet — that turns leaves bitter.`,
    STRAWBERRY: (c) => `Strawberries in week ${c.plant.ageWeeks}: remove runners to push energy into fruiting. Mulch under berries to keep them clean.`,
    DEFAULT: (c) => `${c.plant.name} is in week ${c.plant.ageWeeks}. Check the soil moisture before watering — your last reading was ${c.latestReading?.humidity ?? '—'}% air humidity.`,
};

const STUB_TEMPLATES_DA: Record<string, (ctx: TipContext) => string> = {
    TOMATO: (c) => `Tomater i uge ${c.plant.ageWeeks} skal ofte opbindes og have knebet sideskud. Fugtigheden er ${c.latestReading?.humidity ?? '—'}% i dag — hold øje med tomatpest, hvis den bliver over 80%.`,
    PEPPER: (c) => `Peberfrugter i uge ${c.plant.ageWeeks} har gavn af kalkholdig gødning. Hold fugtigheden stabil omkring 60% for at undgå blomsterfald.`,
    CUCUMBER: (c) => `Agurker i uge ${c.plant.ageWeeks} drikker meget — hold jorden jævnt fugtig. Bind nye ranker til opbindingen ugentligt.`,
    LETTUCE: (c) => `Salat i uge ${c.plant.ageWeeks} foretrækker kølige rødder — dæk bedet med halm og vand om morgenen.`,
    BASIL: (c) => `Knib basilikum over det andet bladpar for at holde den buskagtig. Lad den ikke blomstre endnu — det gør bladene bitre.`,
    STRAWBERRY: (c) => `Jordbær i uge ${c.plant.ageWeeks}: fjern udløbere for at sende energi til frugterne. Læg halm under bærrene for at holde dem rene.`,
    DEFAULT: (c) => `${c.plant.name} er i uge ${c.plant.ageWeeks}. Tjek jordfugtigheden før du vander — sidste måling var ${c.latestReading?.humidity ?? '—'}% luftfugtighed.`,
};

export class StubLlmProvider implements LlmProvider {
    readonly source = 'stub';
    async generate(ctx: TipContext): Promise<string> {
        const table = ctx.locale === 'da' ? STUB_TEMPLATES_DA : STUB_TEMPLATES_EN;
        const fn = table[ctx.plant.type] ?? table.DEFAULT;
        return fn(ctx);
    }
}

const TIP_TTL_MS = 24 * 60 * 60 * 1000;

export class SmartTipService {
    constructor(private provider: LlmProvider) {}

    async getOrGenerate(plantId: string, userId: string, locale: 'en' | 'da' = 'en', latestReading: TipContext['latestReading'] = null) {
        const existing = await SmartTip.findOne({ plantId, userId });
        if (existing && Date.now() - existing.generatedAt.getTime() < TIP_TTL_MS) {
            return existing;
        }
        return this.regenerate(plantId, userId, locale, latestReading);
    }

    async refresh(plantId: string, userId: string, locale: 'en' | 'da' = 'en', latestReading: TipContext['latestReading'] = null) {
        return this.regenerate(plantId, userId, locale, latestReading);
    }

    private async regenerate(plantId: string, userId: string, locale: 'en' | 'da', latestReading: TipContext['latestReading']) {
        const plant = await Plant.findOne({ _id: plantId, userId }).lean();
        if (!plant) throw new Error('Plant not found');

        const actions = await PlantAction.find({ plantId, userId }).sort({ createdAt: -1 }).limit(5).lean();
        const now = Date.now();
        // Defensive parse: some legacy rows store plantedDate as { $date: '...' }
        const raw: any = plant.plantedDate;
        const plantedMs = raw instanceof Date
            ? raw.getTime()
            : raw && typeof raw === 'object' && '$date' in raw
                ? new Date(raw.$date).getTime()
                : new Date(raw).getTime();
        const plantedDate = isNaN(plantedMs) ? new Date(now) : new Date(plantedMs);
        const ageWeeks = Math.max(1, Math.floor((now - plantedDate.getTime()) / (7 * 24 * 60 * 60 * 1000)));

        const ctx: TipContext = {
            plant: { type: plant.type, name: plant.name, plantedDate, ageWeeks },
            latestReading,
            recentActions: actions.map((a: any) => ({
                type: a.type,
                daysAgo: Math.floor((now - new Date(a.createdAt).getTime()) / (24 * 60 * 60 * 1000)),
            })),
            locale,
        };

        const text = await this.provider.generate(ctx);
        const generatedAt = new Date();
        const doc = await SmartTip.findOneAndUpdate(
            { plantId, userId },
            { $set: { text, source: this.provider.source, generatedAt }, $setOnInsert: { plantId, userId } },
            { upsert: true, new: true }
        );
        return doc!;
    }
}
