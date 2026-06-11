import mqtt, { MqttClient } from 'mqtt';
import { ShellyDevice, IShellyDevice } from './models';
import { handleSensorData } from './resolvers';

const URL = process.env.MQTT_BROKER_URL ?? 'mqtts://example.hivemq.cloud:8883';
const PASSWORD = process.env.MQTT_SERVER_PASSWORD ?? '';

const TOPIC_TEMP = 'gw/+/status/temperature:0';
const TOPIC_HUM = 'gw/+/status/humidity:0';
const TOPIC_PWR = 'gw/+/status/devicepower:0';
const TOPIC_ONLINE = 'gw/+/online';

const DEBOUNCE_MS = 2000;
const DEVICE_CACHE_MS = 60_000;

interface DeviceBuffer {
    temperature?: number;
    humidity?: number;
    battery?: number | null;
    flushTimer?: NodeJS.Timeout;
}

const buffers = new Map<string, DeviceBuffer>();
const deviceCache = new Map<string, { device: IShellyDevice; cachedAt: number }>();

async function lookupDevice(deviceId: string): Promise<IShellyDevice | null> {
    const cached = deviceCache.get(deviceId);
    if (cached && Date.now() - cached.cachedAt < DEVICE_CACHE_MS) {
        return cached.device;
    }
    const fresh = await ShellyDevice.findOne({ deviceId });
    if (fresh) {
        deviceCache.set(deviceId, { device: fresh, cachedAt: Date.now() });
        return fresh;
    }
    return null;
}

function scheduleFlush(deviceId: string) {
    const buf = buffers.get(deviceId);
    if (!buf) return;
    if (buf.flushTimer) clearTimeout(buf.flushTimer);
    buf.flushTimer = setTimeout(() => flush(deviceId), DEBOUNCE_MS);
}

async function flush(deviceId: string) {
    const buf = buffers.get(deviceId);
    if (!buf) return;
    buffers.delete(deviceId);

    const device = await lookupDevice(deviceId);
    if (!device) {
        console.warn(`[mqtt] Dropped reading from unknown device ${deviceId}`);
        return;
    }

    const update: any = { lastSeenAt: new Date() };
    if (buf.battery != null) update.lastBatteryPercent = buf.battery;
    await ShellyDevice.updateOne({ _id: device._id }, { $set: update });

    if (buf.temperature !== undefined || buf.humidity !== undefined) {
        await handleSensorData({
            deviceId: device.deviceId,
            temperature: buf.temperature,
            humidity: buf.humidity,
            userId: device.userId,
        });
    }
}

function parseDeviceId(topic: string): string | null {
    const parts = topic.split('/');
    return parts[1] ?? null;
}

function getOrCreateBuffer(deviceId: string): DeviceBuffer {
    let buf = buffers.get(deviceId);
    if (!buf) { buf = {}; buffers.set(deviceId, buf); }
    return buf;
}

function onMessage(topic: string, payload: Buffer) {
    const deviceId = parseDeviceId(topic);
    if (!deviceId) return;

    let data: any;
    try { data = JSON.parse(payload.toString('utf8')); }
    catch { /* online topic is plain "true"/"false" */ }

    if (topic.endsWith('/status/temperature:0')) {
        if (data && typeof data.tC === 'number') {
            getOrCreateBuffer(deviceId).temperature = data.tC;
            scheduleFlush(deviceId);
        }
    } else if (topic.endsWith('/status/humidity:0')) {
        if (data && typeof data.rh === 'number') {
            getOrCreateBuffer(deviceId).humidity = data.rh;
            scheduleFlush(deviceId);
        }
    } else if (topic.endsWith('/status/devicepower:0')) {
        if (data && data.battery && typeof data.battery.percent === 'number') {
            getOrCreateBuffer(deviceId).battery = data.battery.percent;
            scheduleFlush(deviceId);
        }
    } else if (topic.endsWith('/online')) {
        const text = payload.toString('utf8');
        console.log(`[mqtt] device ${deviceId} online=${text}`);
    }
}

let client: MqttClient | null = null;

export function startMqttConsumer() {
    if (client) return;
    console.log(`[mqtt] connecting to ${URL} as gw-server`);
    client = mqtt.connect(URL, {
        username: 'gw-server',
        password: PASSWORD,
        reconnectPeriod: 5000,
    });
    client.on('connect', () => {
        console.log('[mqtt] connected');
        client!.subscribe([TOPIC_TEMP, TOPIC_HUM, TOPIC_PWR, TOPIC_ONLINE], err => {
            if (err) console.error('[mqtt] subscribe failed:', err);
            else console.log('[mqtt] subscribed to gw/+/status/+:0 and gw/+/online');
        });
    });
    client.on('reconnect', () => console.log('[mqtt] reconnecting…'));
    client.on('error', err => console.error('[mqtt] error:', err));
    client.on('message', (topic, payload) => onMessage(topic, payload));
}
