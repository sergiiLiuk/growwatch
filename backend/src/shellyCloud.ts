export interface ShellyCloudDevice {
    id: string;
    name: string;
    online: boolean;
}

export interface ShellyCloudStatus {
    id: string;
    temperature?: number;
    humidity?: number;
    batteryPercent?: number;
    reportedAt: Date | null;
}

export class ShellyAuthError extends Error {
    constructor() { super('Shelly Cloud rejected the auth key'); this.name = 'ShellyAuthError'; }
}

function baseUrl(host: string): string {
    const h = host.replace(/^https?:\/\//, '').replace(/\/+$/, '');
    return `https://${h}`;
}

// Pure: map one device's raw v2 status object → our shape. Exported for verification.
export function mapStatus(id: string, raw: any): ShellyCloudStatus {
    const status = raw?.status ?? raw ?? {};
    const tC = status['temperature:0']?.tC;
    const rh = status['humidity:0']?.rh;
    const battery = status['devicepower:0']?.battery?.percent;
    const updated = status['_updated'] ?? raw?.['_updated'];
    let reportedAt: Date | null = null;
    if (typeof updated === 'number') reportedAt = new Date(updated * 1000);
    else if (typeof updated === 'string') { const d = new Date(updated); reportedAt = isNaN(d.getTime()) ? null : d; }
    return {
        id,
        temperature: typeof tC === 'number' ? tC : undefined,
        humidity: typeof rh === 'number' ? rh : undefined,
        batteryPercent: typeof battery === 'number' ? battery : undefined,
        reportedAt,
    };
}

// Discovery: list all devices on the account (used at connect time).
export async function listDevices(host: string, authKey: string): Promise<ShellyCloudDevice[]> {
    const res = await fetch(`${baseUrl(host)}/device/all_status?auth_key=${encodeURIComponent(authKey)}`);
    if (res.status === 401) throw new ShellyAuthError();
    if (!res.ok) throw new Error(`Shelly Cloud list failed: ${res.status}`);
    const json: any = await res.json();
    const devices = json?.data?.devices_status ?? {};
    return Object.keys(devices).map(id => ({
        id,
        name: devices[id]?.name ?? id,
        online: devices[id]?.cloud?.connected ?? devices[id]?.online ?? false,
    }));
}

// Polling: fetch status for up to 10 device ids via the supported v2 endpoint.
export async function getDevicesStatus(host: string, authKey: string, ids: string[]): Promise<ShellyCloudStatus[]> {
    if (ids.length === 0) return [];
    const res = await fetch(`${baseUrl(host)}/v2/devices/api/get?auth_key=${encodeURIComponent(authKey)}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ids: ids.slice(0, 10), select: ['status'] }),
    });
    if (res.status === 401) throw new ShellyAuthError();
    if (!res.ok) throw new Error(`Shelly Cloud status failed: ${res.status}`);
    const json: any = await res.json();
    const arr: any[] = Array.isArray(json) ? json : (json?.devices ?? json?.data ?? []);
    return arr.map(d => mapStatus(d?.id ?? d?.device_id, d));
}
