import { PlantReminder, Plant } from '../models';
import { sendPushToUser } from './pushSender';

const NOTIFY_COOLDOWN_MS = 24 * 60 * 60 * 1000;

const ACTION_TITLE: Record<string, { en: string; emoji: string }> = {
    water:     { en: 'Time to water', emoji: '💧' },
    fertilize: { en: 'Time to fertilize', emoji: '🌱' },
};

/**
 * Looks for due reminders that haven't been notified in the last 24h, sends
 * push notifications, and stamps lastNotifiedAt. The /alerts page surfaces
 * due reminders live regardless — this scheduler exists only to drive push.
 */
async function tick() {
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

    if (due.length === 0) return;

    // Batch by user so we look up plant names once per plant
    const plantIds = Array.from(new Set(due.map(r => r.plantId)));
    const plants = await Plant.find({ _id: { $in: plantIds } }).lean();
    const plantById = new Map(plants.map((p: any) => [p._id.toString(), p]));

    for (const r of due) {
        const plant: any = plantById.get(r.plantId);
        if (!plant) continue;
        const meta = ACTION_TITLE[r.actionType];
        if (!meta) continue;

        try {
            await sendPushToUser(r.userId, {
                title: `${meta.emoji} ${meta.en}: ${plant.name}`,
                body: `${plant.name} is due for ${r.actionType}. Tap to mark done.`,
                tag: `reminder-${r._id}`,
                url: `/plants/${r.plantId}`,
                data: { plantId: r.plantId, actionType: r.actionType, reminderId: (r as any)._id.toString() },
            });
            await PlantReminder.updateOne({ _id: (r as any)._id }, { $set: { lastNotifiedAt: now } });
        } catch (err) {
            console.error('reminder push failed:', err);
        }
    }

    console.log(`🔔 reminder tick: ${due.length} due, push sent`);
}

export function startReminderScheduler() {
    // Fire on the next whole minute, then every 60 minutes.
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
