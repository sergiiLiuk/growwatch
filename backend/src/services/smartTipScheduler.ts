import { UserSettings } from '../models';
import { getSmartTipService } from '../resolvers';

const DEFAULT_MORNING = '07:00';
const DEFAULT_EVENING = '20:00';

function nowHHMM(): string {
    const d = new Date();
    return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
}

function isSameDay(a: Date, b: Date): boolean {
    return a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();
}

async function tick() {
    const hhmm = nowHHMM();
    const now = new Date();

    const candidates = await UserSettings.find({
        $and: [
            { $or: [{ smartTipsEnabled: { $ne: false } }] },
            { $or: [{ morningTipTime: hhmm }, { eveningTipTime: hhmm }, ...(hhmm === DEFAULT_MORNING || hhmm === DEFAULT_EVENING ? [{ morningTipTime: { $exists: false } }] : [])] },
        ],
    }).lean();

    for (const s of candidates) {
        const morning = s.morningTipTime ?? DEFAULT_MORNING;
        const evening = s.eveningTipTime ?? DEFAULT_EVENING;
        const cycle: 'morning' | 'evening' | null = hhmm === morning ? 'morning' : hhmm === evening ? 'evening' : null;
        if (!cycle) continue;

        const last = s.lastSmartTipRun?.[cycle];
        if (last && isSameDay(new Date(last), now)) continue;

        try {
            await getSmartTipService().regenerateForUser(s.userId, cycle);
            await UserSettings.updateOne(
                { userId: s.userId },
                { $set: { [`lastSmartTipRun.${cycle}`]: now } },
            );
            console.log(`✨ Smart tip briefing generated for ${s.userId} (${cycle})`);
        } catch (err) {
            console.error(`Smart tip briefing failed for ${s.userId} (${cycle}):`, err);
        }
    }
}

export function startSmartTipScheduler() {
    // Fire on the next whole minute, then every 60s.
    const now = new Date();
    const msUntilNextMinute = (60 - now.getSeconds()) * 1000 - now.getMilliseconds();
    setTimeout(() => {
        tick().catch(err => console.error('smart tip tick error:', err));
        setInterval(() => {
            tick().catch(err => console.error('smart tip tick error:', err));
        }, 60 * 1000);
    }, Math.max(0, msUntilNextMinute));
    console.log('⏰ Smart tip scheduler started');
}
