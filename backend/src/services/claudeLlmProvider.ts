import Anthropic from '@anthropic-ai/sdk';
import type { LlmProvider, BriefingContext, Briefing } from './smartTip';

const DEFAULT_MODEL = 'claude-haiku-4-5';

const SYSTEM_PROMPTS = {
    en: `You are a friendly, concise greenhouse-care assistant for a hobby grower.
You will be given the current cycle (morning or evening), live sensor and weather context, and a list of monitored plants with their recent care actions.
Return ONLY valid JSON matching this exact shape:
{ "overview": "1-2 sentence greenhouse-wide tip", "plantTips": { "<plantId>": "1-2 sentence plant-specific tip" } }
Tips should be specific, actionable, and reference the provided data when relevant.
Never invent plants. Only include plantTips entries for the plant IDs you were given.
No prose outside the JSON, no markdown fences.`,
    da: `Du er en venlig, kortfattet drivhus-assistent for en hobbygartner.
Du modtager den aktuelle cyklus (morgen eller aften), live sensor- og vejrdata samt en liste af overvågede planter med deres seneste pasningshandlinger.
Returnér KUN gyldig JSON i præcis denne form:
{ "overview": "1-2 sætninger om drivhuset generelt", "plantTips": { "<plantId>": "1-2 sætninger specifikt for planten" } }
Råd skal være konkrete og handlingsorienterede og referere til de givne data, når det er relevant.
Opfind aldrig planter. Inkluder kun plantTips-poster for de plante-ID'er, du har fået.
Ingen prosa uden for JSON, ingen markdown-fences.`,
};

function buildUserMessage(ctx: BriefingContext): string {
    const cycleLine = ctx.locale === 'da'
        ? (ctx.cycle === 'morning' ? 'Det er morgen — giv en plan for i dag.' : 'Det er aften — opsumér dagen og hvad der skal holdes øje med i nat eller i morgen tidlig.')
        : (ctx.cycle === 'morning' ? "It's morning — give a plan for today." : "It's evening — review the day and what to watch overnight or first thing tomorrow.");

    return [
        cycleLine,
        '',
        'Sensors:',
        JSON.stringify(ctx.sensors, null, 2),
        '',
        'Weather:',
        JSON.stringify(ctx.weather, null, 2),
        '',
        'Plants:',
        JSON.stringify(ctx.plants, null, 2),
    ].join('\n');
}

function extractJson(text: string): any {
    const trimmed = text.trim();
    if (trimmed.startsWith('{')) return JSON.parse(trimmed);
    // Tolerate accidental ```json fences
    const match = trimmed.match(/\{[\s\S]*\}/);
    if (!match) throw new Error('No JSON object found in Claude response');
    return JSON.parse(match[0]);
}

export interface ClaudeLlmProviderOptions {
    apiKey: string;
    model?: string;
}

export class ClaudeLlmProvider implements LlmProvider {
    private client: Anthropic;
    private model: string;
    readonly source: string;

    constructor(opts: ClaudeLlmProviderOptions) {
        this.client = new Anthropic({ apiKey: opts.apiKey });
        this.model = opts.model ?? DEFAULT_MODEL;
        this.source = this.model;
    }

    async generateBriefing(ctx: BriefingContext): Promise<Briefing> {
        const system = SYSTEM_PROMPTS[ctx.locale] ?? SYSTEM_PROMPTS.en;
        const userMsg = buildUserMessage(ctx);

        const response = await this.client.messages.create({
            model: this.model,
            max_tokens: 1024,
            system,
            messages: [{ role: 'user', content: userMsg }],
        });

        const textBlock = response.content.find((b: any) => b.type === 'text') as { type: 'text'; text: string } | undefined;
        if (!textBlock) throw new Error('Claude returned no text content');

        const parsed = extractJson(textBlock.text);
        if (typeof parsed.overview !== 'string') throw new Error('Claude response missing overview');
        if (!parsed.plantTips || typeof parsed.plantTips !== 'object') throw new Error('Claude response missing plantTips');

        // Drop tips for plant IDs we didn't ask about.
        const validIds = new Set(ctx.plants.map(p => p.id));
        const plantTips: Record<string, string> = {};
        for (const [id, text] of Object.entries(parsed.plantTips)) {
            if (validIds.has(id) && typeof text === 'string') plantTips[id] = text;
        }

        return { overview: parsed.overview, plantTips };
    }
}
