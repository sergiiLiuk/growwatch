import { PlantReminder, Plant } from '../models';
import { sendPushToUser } from './pushSender';

const NOTIFY_COOLDOWN_MS = 24 * 60 * 60 * 1000;
const REQUEST_TICK_MIN_INTERVAL_MS = 10 * 60 * 1000; // request-driven ticks debounced to 10 min

const ACTION_TITLE: Record<string, { en: string; emoji: string }> = {
    water:     { en: 'Time to water', emoji: '💧' },
    fertilize: { en: 'Time to fertilize', emoji: '🌱' },
};

let lastTickAt = 0;
let tickInFlight = false;

/**
 * Looks for due reminders that haven't been notified in the last 24h, sends
 * push notifications, and stamps lastNotifiedAt. The /alerts page surfaces
 * due reminders live regardless — this scheduler exists only to drive push.
 */
async function tick() {
    if (tickInFlight) return;
    tickInFlight = true;
    lastTickAt = Date.now();
    try {
        const now = new Date();
        const cooldownCutoff = new Date(now.getTime() - NOTIFY_COOLDOWN_MS);

        const due = await PlantReminder.find({
            enabled: true,
            nextDueAt: { $lte: now },
            $and: [
                { $or: [{ snoozedUntil: { $exists: false } }, { snoozedUntil: null }, { snoozedUntil: { $lte: now } }] },
                { $or: [{ lastNotifiedAt: { $exists: false } }, { lastNotifiedAt: null }, { lastNotifiedAt: { $lte: cooldownCutoff } }] },
            ],
        }).lean();

        if (due.length === 0) {
            console.log('🔔 reminder tick: 0 due');
            return;
        }

        // Batch by user so we look up plant names once per plant
        const plantIds = Array.from(new Set(due.map(r => r.plantId)));
        const plants = await Plant.find({ _id: { $in: plantIds } }).lean();
        const plantById = new Map(plants.map((p: any) => [p._id.toString(), p]));

        let sent = 0;
        for (const r of due) {
            const plant: any = plantById.get(r.plantId);
            if (!plant) continue;
            const meta = ACTION_TITLE[r.actionType];
            if (!meta) continue;

            try {
                const result = await sendPushToUser(r.userId, {
                    title: `${meta.emoji} ${meta.en}: ${plant.name}`,
                    body: `${plant.name} is due for ${r.actionType}. Tap to mark done.`,
                    tag: `reminder-${r._id}`,
                    url: `/plants/${r.plantId}`,
                    data: { plantId: r.plantId, actionType: r.actionType, reminderId: (r as any)._id.toString() },
                });
                sent += result.sent;
                await PlantReminder.updateOne({ _id: (r as any)._id }, { $set: { lastNotifiedAt: now } });
            } catch (err) {
                console.error('reminder push failed:', err);
            }
        }

        console.log(`🔔 reminder tick: ${due.length} due, ${sent} push sent`);
    } finally {
        tickInFlight = false;
    }
}

/**
 * Called on every authenticated GraphQL request. Runs a tick at most once every
 * 10 min — covers the case where the host (e.g. Railway hobby) sleeps the dyno
 * and stops the wallclock setInterval. Cheap when debounced, and waking up
 * because of any user activity is exactly when we want to flush notifications.
 */
export function maybeTickFromRequest() {
    if (Date.now() - lastTickAt < REQUEST_TICK_MIN_INTERVAL_MS) return;
    // Fire in the background — never block the request.
    tick().catch(err => console.error('request-driven reminder tick error:', err));
}

export function startReminderScheduler() {
    // Fire on the next whole minute, then every 60 minutes. Backup to the
    // request-driven path above; either path is enough on its own.
    const now = new Date();
    const msUntilNextMinute = (60 - now.getSeconds()) * 1000 - now.getMilliseconds();
    setTimeout(() => {
        tick().catch(err => console.error('reminder tick error:', err));
        setInterval(() => {
            tick().catch(err => console.error('reminder tick error:', err));
        }, 60 * 60 * 1000);
    }, Math.max(0, msUntilNextMinute));
    console.log('⏰ Reminder scheduler started');
}
