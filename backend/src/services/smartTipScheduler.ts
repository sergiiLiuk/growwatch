import { UserSettings } from '../models';
import { getSmartTipService } from '../resolvers';

const DEFAULT_MORNING = '07:00';
const DEFAULT_EVENING = '20:00';

/**
 * Current wall-clock HH:mm and calendar day (YYYY-MM-DD) for `date` in the
 * given IANA timezone. Missing/invalid zones fall back to UTC so a bad stored
 * value can never throw inside the scheduler loop.
 */
function localParts(date: Date, timezone?: string): { hhmm: string; dayKey: string } {
    const format = (tz: string) =>
        new Intl.DateTimeFormat('en-GB', {
            timeZone: tz, hour12: false,
            year: 'numeric', month: '2-digit', day: '2-digit',
            hour: '2-digit', minute: '2-digit',
        }).formatToParts(date);
    let parts: Intl.DateTimeFormatPart[];
    try {
        parts = format(timezone || 'UTC');
    } catch {
        parts = format('UTC');
    }
    const get = (t: string) => parts.find(p => p.type === t)?.value ?? '';
    let hour = get('hour');
    if (hour === '24') hour = '00'; // some platforms emit '24' at midnight
    return {
        hhmm: `${hour}:${get('minute')}`,
        dayKey: `${get('year')}-${get('month')}-${get('day')}`,
    };
}

async function tick() {
    const now = new Date();

    // Every user who hasn't disabled smart tips. We evaluate each against its
    // own timezone, so we can't pre-filter by a single server-clock minute.
    const candidates = await UserSettings.find({ smartTipsEnabled: { $ne: false } }).lean();
    if (candidates.length === 0) return;

    // Restrict to paid tiers — free users never trigger Claude calls.
    const { User } = await import('../models');
    const userIds = candidates.map(c => c.userId);
    const paidUsers = await User.find({
        _id: { $in: userIds },
        subscriptionTier: { $in: ['plus', 'pro'] },
    }).select('_id').lean();
    const paidIds = new Set(paidUsers.map((u: any) => u._id.toString()));

    for (const s of candidates) {
        if (!paidIds.has(s.userId)) continue;

        const { hhmm, dayKey } = localParts(now, s.timezone);
        const morning = s.morningTipTime ?? DEFAULT_MORNING;
        const evening = s.eveningTipTime ?? DEFAULT_EVENING;

        // Catch-up: a cycle is "due" once its configured time has passed today
        // (in the user's timezone) and it hasn't run yet today. Evening wins
        // when both are due, so a server that was asleep/restarting through both
        // times still lands on the freshest brief instead of a stale morning one.
        const cycle: 'morning' | 'evening' | null =
            hhmm >= evening ? 'evening'
            : hhmm >= morning ? 'morning'
            : null;
        if (!cycle) continue;

        const last = s.lastSmartTipRun?.[cycle];
        if (last && localParts(new Date(last), s.timezone).dayKey === dayKey) continue;

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
