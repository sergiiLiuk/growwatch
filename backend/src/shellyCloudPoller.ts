import { ShellyAccount, ShellyDevice, IShellyDevice } from './models';
import { decryptSecret } from './crypto';
import { getDevicesStatus, ShellyCloudStatus, ShellyAuthError } from './shellyCloud';
import { handleSensorData } from './resolvers';

const POLL_MS = 5 * 60 * 1000;

// Pure: which statuses are newer than what we last ingested for each device.
export function pickNewReadings(
    statuses: ShellyCloudStatus[],
    devices: Pick<IShellyDevice, 'deviceId' | 'lastReportedAt'>[],
): ShellyCloudStatus[] {
    const lastById = new Map(devices.map(d => [d.deviceId, d.lastReportedAt ?? null]));
    return statuses.filter(s => {
        if (!lastById.has(s.id)) return false;
        if (!s.reportedAt) return false;
        const last = lastById.get(s.id)!;
        return !last || s.reportedAt.getTime() > last.getTime();
    });
}

const iso = (d: Date | null | undefined): string => (d ? d.toISOString() : 'null');

async function pollAccount(userId: string, host: string, authKey: string): Promise<void> {
    const devices = await ShellyDevice.find({ userId });
    console.log(`[shelly-cloud] user=${userId}: ${devices.length} device(s) on host ${host}`);
    if (devices.length === 0) return;

    const statuses = await getDevicesStatus(host, authKey, devices.map(d => d.deviceId));
    console.log(`[shelly-cloud] user=${userId}: cloud returned ${statuses.length} status(es)`);
    for (const s of statuses) {
        console.log(`[shelly-cloud]   ${s.id}: temp=${s.temperature ?? '—'} hum=${s.humidity ?? '—'} batt=${s.batteryPercent ?? '—'} cloud _updated=${iso(s.reportedAt)}`);
    }
    const lastById = new Map(devices.map(d => [d.deviceId, d.lastReportedAt ?? null]));

    const fresh = pickNewReadings(statuses, devices);
    if (fresh.length === 0) {
        for (const s of statuses) {
            const last = lastById.get(s.id);
            const why = !s.reportedAt ? 'no _updated timestamp from cloud'
                : (last && s.reportedAt.getTime() <= last.getTime()) ? `not newer than last ingested (${iso(last)})`
                : 'device not tracked';
            console.log(`[shelly-cloud]   ${s.id}: skipped — ${why}`);
        }
    }
    console.log(`[shelly-cloud] user=${userId}: ${fresh.length} new reading(s) after dedup`);

    for (const s of fresh) {
        await handleSensorData({ deviceId: s.id, temperature: s.temperature, humidity: s.humidity, userId });
        await ShellyDevice.updateOne(
            { userId, deviceId: s.id },
            { $set: { lastSeenAt: new Date(), lastReportedAt: s.reportedAt, ...(s.batteryPercent != null ? { lastBatteryPercent: s.batteryPercent } : {}) } },
        );
        console.log(`[shelly-cloud]   ${s.id}: ✅ ingested (temp=${s.temperature ?? '—'} hum=${s.humidity ?? '—'} reportedAt=${iso(s.reportedAt)})`);
    }
}

async function tick(): Promise<void> {
    const accounts = await ShellyAccount.find({ status: 'ok' });
    console.log(`[shelly-cloud] tick: ${accounts.length} account(s) with status=ok`);
    for (const acc of accounts) {
        try {
            await pollAccount(acc.userId, acc.serverHost, decryptSecret(acc.authKeyEnc));
        } catch (err) {
            if (err instanceof ShellyAuthError) {
                await ShellyAccount.updateOne({ _id: acc._id }, { $set: { status: 'auth_error' } });
                console.warn(`[shelly-cloud] auth error for user ${acc.userId}; marked auth_error`);
            } else {
                console.error('[shelly-cloud] poll error:', err);
            }
        }
    }
}

let timer: NodeJS.Timeout | null = null;
export function startShellyCloudPoller() {
    if (timer) return;
    if (!process.env.SHELLY_ENC_KEY) {
        console.warn('[shelly-cloud] SHELLY_ENC_KEY is not set — stored auth keys cannot be decrypted; poller will error each tick until it is configured');
    }
    console.log('[shelly-cloud] poller started (every 5 min)');
    tick().catch(e => console.error('[shelly-cloud] initial tick failed:', e));
    timer = setInterval(() => { tick().catch(e => console.error('[shelly-cloud] tick failed:', e)); }, POLL_MS);
}
