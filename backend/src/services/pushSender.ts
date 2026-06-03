import webpush from 'web-push';
import { PushSubscription } from '../models';

let configured = false;

export function configurePush(): boolean {
    const publicKey = process.env.VAPID_PUBLIC_KEY;
    const privateKey = process.env.VAPID_PRIVATE_KEY;
    const subject = process.env.VAPID_SUBJECT ?? 'mailto:admin@growwatch.app';
    if (!publicKey || !privateKey) {
        console.warn('⚠️  VAPID keys missing — push notifications disabled');
        return false;
    }
    webpush.setVapidDetails(subject, publicKey, privateKey);
    configured = true;
    return true;
}

export function isPushConfigured(): boolean {
    return configured;
}

export interface PushPayload {
    title: string;
    body: string;
    icon?: string;
    badge?: string;
    tag?: string;        // Browser collapses notifications sharing the same tag
    url?: string;        // Path to open on notification click
    data?: Record<string, unknown>;
}

/**
 * Wraps a flat PushPayload into the envelope Angular's ngsw-worker.js expects.
 * ngsw inspects the `notification` field and calls showNotification with it.
 * Click routing uses the `data.onActionClick.default` block.
 */
function toNgswEnvelope(payload: PushPayload): Record<string, unknown> {
    return {
        notification: {
            title: payload.title,
            body: payload.body,
            icon: payload.icon ?? '/icons/icon-192x192.png',
            badge: payload.badge ?? '/icons/icon-72x72.png',
            tag: payload.tag,
            data: {
                ...(payload.data ?? {}),
                onActionClick: payload.url ? {
                    default: { operation: 'openWindow', url: payload.url },
                } : undefined,
            },
        },
    };
}

/**
 * Sends a push to every subscription a user has. Subscriptions that fail with
 * 404 or 410 (Gone) are removed since the browser has unsubscribed.
 */
export async function sendPushToUser(userId: string, payload: PushPayload): Promise<{ sent: number; pruned: number }> {
    if (!configured) return { sent: 0, pruned: 0 };

    const subs = await PushSubscription.find({ userId }).lean();
    if (subs.length === 0) return { sent: 0, pruned: 0 };

    const json = JSON.stringify(toNgswEnvelope(payload));
    let sent = 0;
    let pruned = 0;

    await Promise.all(subs.map(async (s) => {
        try {
            await webpush.sendNotification(
                { endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } },
                json,
            );
            sent++;
        } catch (err: any) {
            const status = err?.statusCode;
            if (status === 404 || status === 410) {
                await PushSubscription.deleteOne({ _id: (s as any)._id });
                pruned++;
            } else {
                console.error('Push send failed:', status, err?.message);
            }
        }
    }));

    return { sent, pruned };
}
