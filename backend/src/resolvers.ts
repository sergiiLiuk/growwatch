import { v4 as uuidv4 } from 'uuid';
import { pubsub, SENSOR_DATA_CHANNEL, deviceClaimedChannel } from './pubsub';
import { SensorData } from './types';
import { HourlySensorData, Plant, User, Device, UserSettings, PlantAction, PlantActionType, DailyBriefing, PlantReminder, PushSubscription, ReminderActionType } from './models';
import { SmartTipService, StubLlmProvider, LlmProvider } from './services/smartTip';
import { getLightStatus, PlantType } from './lightUtils';
import { signToken, verifyPassword, hashPassword, JwtPayload } from './auth';
import { pushReading, getAll as getAllReadings, getAllForUser as getReadingsForUser } from './sensorStore';

let lastSavedHour: number = -1;

// Set by index.ts after superuser is seeded. Used as the default user when the hourly
// timer flushes the accumulator at hour boundaries (no fallback for device attribution).
let superuserId: string | null = null;
export function setSuperuserId(id: string) { superuserId = id; }

// ── Device claim window (in-memory) ─────────────────────────────────────────
// userId → expiresAt (ms epoch). Cleared on bind or expiry.
const CLAIM_WINDOW_MS = 10 * 60 * 1000;
const pendingClaims = new Map<string, number>();

function openClaim(userId: string): number {
    const expiresAt = Date.now() + CLAIM_WINDOW_MS;
    pendingClaims.set(userId, expiresAt);
    return expiresAt;
}

function cancelClaim(userId: string): boolean {
    return pendingClaims.delete(userId);
}

function purgeExpiredClaims() {
    const now = Date.now();
    for (const [uid, exp] of pendingClaims) {
        if (exp <= now) pendingClaims.delete(uid);
    }
}

function activeClaimants(): string[] {
    purgeExpiredClaims();
    return [...pendingClaims.keys()];
}

interface HourlyAccumulator {
    light: number[];
    temperature: number[];
    humidity: number[];
    pressure: number[];
    co2: number[];
}
let hourAccum: HourlyAccumulator = { light: [], temperature: [], humidity: [], pressure: [], co2: [] };

function avg(arr: number[]): number { return arr.reduce((a, b) => a + b, 0) / arr.length; }

// Cached plant type for lightStatus calculations — updated on every plant mutation
let primaryPlantType: PlantType = 'TOMATO';

async function refreshPrimaryPlant() {
    const doc = await Plant.findOne().sort({ createdAt: 1 }).lean();
    if (doc) primaryPlantType = doc.type as PlantType;
}

// Build the upsert document for the current hour from the accumulator. No reset.
async function upsertCurrentHour(userId: string | null, deviceId?: string) {
    if (hourAccum.light.length === 0) return;
    if (!userId) return;

    const now = new Date();
    const hourStart = new Date(now.getFullYear(), now.getMonth(), now.getDate(), now.getHours(), 0, 0, 0);

    const update: any = {
        hour: hourStart,
        userId,
        lightLevel: hourAccum.light[hourAccum.light.length - 1],
        minLight: Math.min(...hourAccum.light),
        maxLight: Math.max(...hourAccum.light),
        avgLight: avg(hourAccum.light),
        readingCount: hourAccum.light.length,
    };
    if (deviceId) update.deviceId = deviceId;

    if (hourAccum.temperature.length > 0) {
        update.avgTemperature = avg(hourAccum.temperature);
        update.minTemperature = Math.min(...hourAccum.temperature);
        update.maxTemperature = Math.max(...hourAccum.temperature);
    }
    if (hourAccum.humidity.length > 0) {
        update.avgHumidity = avg(hourAccum.humidity);
        update.minHumidity = Math.min(...hourAccum.humidity);
        update.maxHumidity = Math.max(...hourAccum.humidity);
    }
    if (hourAccum.pressure.length > 0) {
        update.avgPressure = avg(hourAccum.pressure);
    }
    if (hourAccum.co2.length > 0) {
        update.avgCo2 = avg(hourAccum.co2);
    }

    // Upsert keyed by (userId, hour) — compound unique index in the schema
    await HourlySensorData.findOneAndUpdate(
        { hour: hourStart, userId },
        update,
        { upsert: true, new: true }
    );
}

// Triggered at the top of each hour (resets the accumulator after saving)
export async function saveHourlyData(userId?: string | null, deviceId?: string) {
    if (hourAccum.light.length === 0) {
        console.log('⚠️ No readings to save');
        return;
    }
    try {
        await upsertCurrentHour(userId ?? superuserId, deviceId);
        console.log('💾 Hourly data saved to MongoDB');
    } catch (error) {
        console.error('❌ Error saving hourly data:', error);
    }
}

// Resolve which user this incoming sensor data belongs to.
// Returns { userId, deviceId } or null when the device is unknown and there is no fallback.
async function resolveDeviceOwner(
    mac: string | undefined
): Promise<{ userId: string; deviceId: string } | null> {
    if (mac) {
        const existing = await Device.findOne({ mac });
        if (existing) {
            existing.lastSeenAt = new Date();
            await existing.save();
            return { userId: existing.userId, deviceId: existing._id.toString() };
        }

        // Unknown device — try to bind to an open claim window
        const claimants = activeClaimants();
        if (claimants.length === 1) {
            const userId = claimants[0];
            const defaultName = `Device ${mac.slice(-5)}`;
            const created = await Device.create({
                mac,
                userId,
                name: defaultName,
                lastSeenAt: new Date(),
            });
            pendingClaims.delete(userId);

            // Notify the waiting UI
            pubsub.publish(deviceClaimedChannel(userId), {
                deviceClaimed: mapDevice(created),
            });

            console.log(`🔗 Claimed device ${mac} → user ${userId}`);
            return { userId, deviceId: created._id.toString() };
        }

        if (claimants.length > 1) {
            console.warn(`⚠️ Multiple claim windows open (${claimants.length}); ignoring unknown device ${mac}`);
        }
    }

    return null;
}

// Function to handle incoming sensor data from ESP32
export async function handleSensorData(data: any): Promise<SensorData | null> {
    const owner = await resolveDeviceOwner(data.deviceId);
    if (!owner) {
        console.warn(`🚫 Rejected sensor data — unknown device${data.deviceId ? ` ${data.deviceId}` : ''} and no claim/fallback`);
        return null;
    }

    // Drop physically implausible readings — sensor disconnects on the BME688
    // sometimes surface as -65 / +85 sentinels that wreck min/max aggregates.
    const sane = (v: any, lo: number, hi: number): number | undefined =>
        typeof v === 'number' && isFinite(v) && v >= lo && v <= hi ? v : undefined;

    const sensorData: SensorData & { userId?: string } = {
        id: uuidv4(),
        lightLevel: data.lightLevel,
        timestamp: new Date(),
        temperature: sane(data.temperature, -30, 70),
        humidity: sane(data.humidity, 0, 100),
        pressure: sane(data.pressure, 800, 1200),
        co2: sane(data.co2, 0, 10000),
        deviceId: owner.deviceId || undefined,
        userId: owner.userId,
    };

    pushReading(sensorData);
    hourAccum.light.push(data.lightLevel);
    // Use the sanitized values so out-of-range readings can't pollute hourly aggregates.
    if (sensorData.temperature != null) hourAccum.temperature.push(sensorData.temperature);
    if (sensorData.humidity    != null) hourAccum.humidity.push(sensorData.humidity);
    if (sensorData.pressure    != null) hourAccum.pressure.push(sensorData.pressure);
    if (sensorData.co2         != null) hourAccum.co2.push(sensorData.co2);

    pubsub.publish(SENSOR_DATA_CHANNEL, {
        sensorDataUpdated: sensorData,
    });

    // Persist the current partial-hour snapshot so reload-after-restart shows data immediately
    upsertCurrentHour(owner.userId, owner.deviceId || undefined)
        .catch(err => console.error('❌ snapshot upsert failed:', err));

    return sensorData;
}

export async function initPlantCache() {
    await refreshPrimaryPlant();
}

// Check every minute if we need to save hourly data (at hour boundaries) + reset accumulator
export function startHourlyAggregation() {
    setInterval(async () => {
        const now = new Date();
        const nowHour = now.getHours();

        if (lastSavedHour !== nowHour && now.getMinutes() === 0) {
            await saveHourlyData();
            lastSavedHour = nowHour;
            hourAccum = { light: [], temperature: [], humidity: [], pressure: [], co2: [] };
        }
    }, 60000);
}

function mapHourlyDoc(doc: any) {
    return {
        id: doc._id.toString(),
        hour: doc.hour instanceof Date ? doc.hour.toISOString() : String(doc.hour),
        lightLevel: doc.lightLevel,
        minLight: doc.minLight,
        maxLight: doc.maxLight,
        avgLight: doc.avgLight,
        readingCount: doc.readingCount,
        avgTemperature: doc.avgTemperature ?? null,
        minTemperature: doc.minTemperature ?? null,
        maxTemperature: doc.maxTemperature ?? null,
        avgHumidity: doc.avgHumidity ?? null,
        minHumidity: doc.minHumidity ?? null,
        maxHumidity: doc.maxHumidity ?? null,
        avgPressure: doc.avgPressure ?? null,
        avgCo2: doc.avgCo2 ?? null,
        deviceId: doc.deviceId ?? null,
    };
}

// Safely coerce stored date values to an ISO string. Some legacy/imported
// plant rows have plantedDate stored as a string instead of a Date — calling
// .toISOString() directly on those would throw and break the entire query.
// Coerce whatever Mongoose returns for a date field into a string for the
// GraphQL boundary. The frontend uses dayjs to parse and apply any fallback;
// the backend just passes through.
function dateAsString(value: any): string {
    if (value instanceof Date) return value.toISOString();
    if (typeof value === 'string') return value;
    if (value && typeof value === 'object' && '$date' in value) return String((value as any).$date);
    return String(value ?? '');
}

function mapDevice(doc: any) {
    return {
        id: doc._id.toString(),
        mac: doc.mac,
        name: doc.name,
        lastSeenAt: doc.lastSeenAt ? doc.lastSeenAt.toISOString() : null,
        createdAt: doc.createdAt ? doc.createdAt.toISOString() : new Date().toISOString(),
    };
}

function mapPlant(doc: any) {
    return {
        id: doc._id.toString(),
        name: doc.name,
        type: doc.type,
        plantedDate: dateAsString(doc.plantedDate),
        count: doc.count ?? 1,
        monitored: doc.monitored ?? true,
        archived: doc.archived ?? false,
        dailyLightHours: doc.dailyLightHours ?? 12,
    };
}

function mapPlantAction(doc: any) {
    return {
        id: doc._id.toString(),
        plantId: doc.plantId,
        type: doc.type,
        note: doc.note ?? null,
        createdAt: doc.createdAt instanceof Date ? doc.createdAt.toISOString() : String(doc.createdAt ?? new Date().toISOString()),
    };
}

function mapSmartTip(doc: any) {
    return {
        id: doc._id.toString(),
        plantId: doc.plantId,
        text: doc.text,
        source: doc.source,
        cycle: doc.cycle ?? null,
        generatedAt: doc.generatedAt instanceof Date ? doc.generatedAt.toISOString() : String(doc.generatedAt ?? new Date().toISOString()),
    };
}

// Set by index.ts at boot — chooses Claude vs stub based on ANTHROPIC_API_KEY.
let smartTipService: SmartTipService = new SmartTipService(new StubLlmProvider());
export function setLlmProvider(provider: LlmProvider) {
    smartTipService = new SmartTipService(provider);
}
export function getSmartTipService(): SmartTipService {
    return smartTipService;
}

function mapBriefing(doc: any) {
    return {
        id: doc._id.toString(),
        cycle: doc.cycle,
        overview: doc.overview,
        source: doc.source,
        generatedAt: doc.generatedAt instanceof Date ? doc.generatedAt.toISOString() : String(doc.generatedAt ?? new Date().toISOString()),
    };
}

function mapReminder(doc: any) {
    return {
        id: doc._id.toString(),
        plantId: doc.plantId,
        actionType: doc.actionType,
        intervalDays: doc.intervalDays,
        nextDueAt: doc.nextDueAt instanceof Date ? doc.nextDueAt.toISOString() : String(doc.nextDueAt),
        snoozedUntil: doc.snoozedUntil instanceof Date ? doc.snoozedUntil.toISOString() : (doc.snoozedUntil ?? null),
        enabled: doc.enabled,
    };
}

function currentCycle(settings: any): 'morning' | 'evening' {
    // Pick whichever configured time is closer to "now" and not in the future.
    const morning = settings?.morningTipTime ?? '07:00';
    const evening = settings?.eveningTipTime ?? '20:00';
    const now = new Date();
    const hhmm = `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`;
    if (hhmm >= evening) return 'evening';
    if (hhmm >= morning) return 'morning';
    // Before morning time today → show last night's evening brief framing
    return 'evening';
}

type Ctx = { user: JwtPayload | null };

export const resolvers = {
    Query: {
        sensorData: (_: any, __: any, ctx: Ctx) => {
            if (!ctx.user) return [];
            return getReadingsForUser(ctx.user.userId).slice(-10);
        },
        latestSensorData: async (_: any, __: any, ctx: Ctx) => {
            if (!ctx.user) return null;
            const mine = getReadingsForUser(ctx.user.userId);
            if (mine.length > 0) return mine[mine.length - 1];
            // In-memory empty (e.g. just after backend restart) — fall back to latest hourly snapshot
            try {
                const doc = await HourlySensorData.findOne({ userId: ctx.user.userId })
                    .sort({ hour: -1 })
                    .lean();
                if (!doc) return null;
                return {
                    id: doc._id.toString(),
                    lightLevel: doc.avgLight,
                    timestamp: doc.hour,
                    temperature: doc.avgTemperature ?? undefined,
                    humidity: doc.avgHumidity ?? undefined,
                    co2: doc.avgCo2 ?? undefined,
                    pressure: doc.avgPressure ?? undefined,
                    deviceId: doc.deviceId ?? undefined,
                };
            } catch {
                return null;
            }
        },
        hourlyData: async (_: any, { limit = 24 }: { limit?: number }, ctx: Ctx) => {
            if (!ctx.user) return [];
            try {
                const data = await HourlySensorData.find({ userId: ctx.user.userId })
                    .sort({ hour: -1 })
                    .limit(limit)
                    .lean();
                return data.map(mapHourlyDoc);
            } catch (error) {
                console.error('❌ Error fetching hourly data:', error);
                return [];
            }
        },
        hourlyDataRange: async (_: any, { from, to }: { from: string; to: string }, ctx: Ctx) => {
            if (!ctx.user) return [];
            try {
                const data = await HourlySensorData.find({
                    userId: ctx.user.userId,
                    hour: { $gte: new Date(from), $lte: new Date(to) },
                }).sort({ hour: 1 }).lean();
                return data.map(mapHourlyDoc);
            } catch (error) {
                console.error('❌ Error fetching hourly data range:', error);
                return [];
            }
        },
        plants: async (_: any, { includeArchived }: { includeArchived?: boolean }, ctx: Ctx) => {
            if (!ctx.user) return [];
            const query: any = { userId: ctx.user.userId };
            if (!includeArchived) query.archived = { $ne: true };
            const docs = await Plant.find(query).sort({ createdAt: 1 }).lean();
            return docs.map(mapPlant);
        },
        plantActions: async (_: any, { plantId, limit }: { plantId: string; limit?: number }, ctx: Ctx) => {
            if (!ctx.user) throw new Error('Unauthorized');
            const docs = await PlantAction.find({ plantId, userId: ctx.user.userId })
                .sort({ createdAt: -1 })
                .limit(limit ?? 100)
                .lean();
            return docs.map(mapPlantAction);
        },
        smartTip: async (_: any, { plantId }: { plantId: string }, ctx: Ctx) => {
            if (!ctx.user) throw new Error('Unauthorized');
            // Read-only: latest stored tip for this plant. Generation is driven by the briefing scheduler.
            const { SmartTip } = await import('./models');
            const doc = await SmartTip.findOne({ plantId, userId: ctx.user.userId }).lean();
            return doc ? mapSmartTip(doc) : null;
        },
        dailyBriefing: async (_: any, __: any, ctx: Ctx) => {
            if (!ctx.user) throw new Error('Unauthorized');
            const doc = await DailyBriefing.findOne({ userId: ctx.user.userId }).lean();
            return doc ? mapBriefing(doc) : null;
        },
        plantReminders: async (_: any, { plantId }: { plantId?: string }, ctx: Ctx) => {
            if (!ctx.user) throw new Error('Unauthorized');
            const query: any = { userId: ctx.user.userId };
            if (plantId) query.plantId = plantId;
            const docs = await PlantReminder.find(query).sort({ nextDueAt: 1 }).lean();
            return docs.map(mapReminder);
        },
        vapidPublicKey: () => process.env.VAPID_PUBLIC_KEY ?? null,
        myDevices: async (_: any, __: any, ctx: Ctx) => {
            if (!ctx.user) return [];
            const docs = await Device.find({ userId: ctx.user.userId }).sort({ createdAt: 1 }).lean();
            return docs.map(mapDevice);
        },
        myUserSettings: async (_: any, __: any, ctx: Ctx) => {
            if (!ctx.user) throw new Error('Unauthorized');
            const settings = await UserSettings.findOne({ userId: ctx.user.userId }).lean();
            return {
                tempMin: settings?.tempMin ?? null,
                tempMax: settings?.tempMax ?? null,
                humidityMin: settings?.humidityMin ?? null,
                humidityMax: settings?.humidityMax ?? null,
                frostThreshold: settings?.frostThreshold ?? null,
                heatThreshold: settings?.heatThreshold ?? null,
                windThreshold: settings?.windThreshold ?? null,
                digestTime: settings?.digestTime ?? null,
                digestEnabled: settings?.digestEnabled ?? null,
                alertsEnabled: settings?.alertsEnabled ?? null,
                locale: settings?.locale ?? null,
                smartTipsEnabled: settings?.smartTipsEnabled ?? null,
                morningTipTime: settings?.morningTipTime ?? null,
                eveningTipTime: settings?.eveningTipTime ?? null,
                location: settings?.location
                    ? { lat: settings.location.lat, lng: settings.location.lng, city: settings.location.city ?? null }
                    : null,
            };
        },
        allUsers: async (_: any, __: any, ctx: Ctx) => {
            if (!ctx.user) throw new Error('Unauthorized');
            if (ctx.user.role !== 'superuser') throw new Error('Forbidden: superuser only');

            const users = await User.find({}).sort({ createdAt: 1 }).lean();
            // Counts per user via aggregation (cheap for small user counts; revisit if it scales)
            const [deviceCounts, plantCounts] = await Promise.all([
                Device.aggregate([{ $group: { _id: '$userId', n: { $sum: 1 } } }]),
                Plant.aggregate([{ $group: { _id: '$userId', n: { $sum: 1 } } }]),
            ]);
            const devicesByUser = new Map(deviceCounts.map((d: any) => [d._id, d.n]));
            const plantsByUser = new Map(plantCounts.map((p: any) => [p._id, p.n]));

            return users.map((u: any) => ({
                id: u._id.toString(),
                email: u.email,
                role: u.role,
                subscriptionTier: u.subscriptionTier ?? 'free',
                createdAt: u.createdAt instanceof Date ? u.createdAt.toISOString() : String(u.createdAt ?? ''),
                deviceCount: devicesByUser.get(u._id.toString()) ?? 0,
                plantCount: plantsByUser.get(u._id.toString()) ?? 0,
            }));
        },
        me: async (_: any, __: any, ctx: Ctx) => {
            if (!ctx.user) throw new Error('Unauthorized');
            const user = await User.findById(ctx.user.userId).lean();
            if (!user) throw new Error('Unauthorized');
            return {
                token: '',
                email: user.email,
                role: user.role,
                userId: ctx.user.userId,
                subscriptionTier: user.subscriptionTier ?? 'free',
            };
        },
    },

    Mutation: {
        login: async (_: any, { email, password }: { email: string; password: string }) => {
            const user = await User.findOne({ email });
            if (!user || !(await verifyPassword(password, user.passwordHash))) {
                throw new Error('Invalid credentials');
            }
            const userId = user._id.toString();
            const token = signToken({ userId, email: user.email, role: user.role });
            return { token, email: user.email, role: user.role, userId, subscriptionTier: user.subscriptionTier ?? 'free' };
        },
        addPlant: async (_: any, { name, type, plantedDate, count, dailyLightHours = 12 }: { name: string; type: PlantType; plantedDate: string; count: number; dailyLightHours?: number }, ctx: Ctx) => {
            if (!ctx.user) throw new Error('Unauthorized');
            const doc = await Plant.create({ name, type, plantedDate: new Date(plantedDate), count, monitored: true, dailyLightHours, userId: ctx.user.userId });
            await refreshPrimaryPlant();
            return mapPlant(doc);
        },
        updatePlant: async (_: any, { id, name, type, plantedDate, count, dailyLightHours = 12 }: { id: string; name: string; type: PlantType; plantedDate: string; count: number; dailyLightHours?: number }, ctx: Ctx) => {
            if (!ctx.user) throw new Error('Unauthorized');
            const doc = await Plant.findOneAndUpdate(
                { _id: id, userId: ctx.user.userId },
                { name, type, plantedDate: new Date(plantedDate), count, dailyLightHours },
                { new: true }
            );
            if (!doc) throw new Error('Plant not found');
            await refreshPrimaryPlant();
            return mapPlant(doc);
        },
        setPlantMonitored: async (_: any, { id, monitored }: { id: string; monitored: boolean }, ctx: Ctx) => {
            if (!ctx.user) throw new Error('Unauthorized');
            const doc = await Plant.findOneAndUpdate(
                { _id: id, userId: ctx.user.userId },
                { monitored },
                { new: true }
            );
            if (!doc) throw new Error('Plant not found');
            await refreshPrimaryPlant();
            return mapPlant(doc);
        },
        setPlantArchived: async (_: any, { id, archived }: { id: string; archived: boolean }, ctx: Ctx) => {
            if (!ctx.user) throw new Error('Unauthorized');
            const doc = await Plant.findOneAndUpdate(
                { _id: id, userId: ctx.user.userId },
                { archived },
                { new: true }
            );
            if (!doc) throw new Error('Plant not found');
            await refreshPrimaryPlant();
            return mapPlant(doc);
        },
        removePlant: async (_: any, { id }: { id: string }, ctx: Ctx) => {
            if (!ctx.user) throw new Error('Unauthorized');
            const result = await Plant.findOneAndDelete({ _id: id, userId: ctx.user.userId });
            // Cascade: also remove the action log and any cached tip for this plant
            await PlantAction.deleteMany({ plantId: id, userId: ctx.user.userId });
            await refreshPrimaryPlant();
            return result !== null;
        },
        logPlantAction: async (_: any, { plantId, type, note }: { plantId: string; type: PlantActionType; note?: string }, ctx: Ctx) => {
            if (!ctx.user) throw new Error('Unauthorized');
            const plant = await Plant.findOne({ _id: plantId, userId: ctx.user.userId });
            if (!plant) throw new Error('Plant not found');
            const doc = await PlantAction.create({ plantId, userId: ctx.user.userId, type, note: note ?? undefined });

            // If this action matches a reminder, reset its timer. "Mark done."
            if (type === 'water' || type === 'fertilize') {
                const reminder = await PlantReminder.findOne({
                    plantId, userId: ctx.user.userId, actionType: type, enabled: true,
                });
                if (reminder) {
                    const next = new Date(Date.now() + reminder.intervalDays * 24 * 60 * 60 * 1000);
                    reminder.nextDueAt = next;
                    reminder.snoozedUntil = undefined;
                    reminder.lastNotifiedAt = undefined;
                    await reminder.save();
                }
            }
            return mapPlantAction(doc);
        },
        removePlantAction: async (_: any, { id }: { id: string }, ctx: Ctx) => {
            if (!ctx.user) throw new Error('Unauthorized');
            const result = await PlantAction.findOneAndDelete({ _id: id, userId: ctx.user.userId });
            return result !== null;
        },
        regenerateBriefing: async (_: any, __: any, ctx: Ctx) => {
            if (!ctx.user) throw new Error('Unauthorized');
            const user = await User.findById(ctx.user.userId).lean();
            if (!user || !['plus', 'pro'].includes(user.subscriptionTier ?? 'free')) {
                throw new Error('Smart tips require a Plus subscription');
            }

            const settings = await UserSettings.findOne({ userId: ctx.user.userId }).lean();
            const last = settings?.lastManualRefreshAt;
            const COOLDOWN_MS = 5 * 60 * 1000;
            if (last && Date.now() - new Date(last).getTime() < COOLDOWN_MS) {
                const waitSec = Math.ceil((COOLDOWN_MS - (Date.now() - new Date(last).getTime())) / 1000);
                throw new Error(`Please wait ${waitSec}s before refreshing again`);
            }

            await smartTipService.regenerateForUser(ctx.user.userId, 'manual');
            await UserSettings.updateOne(
                { userId: ctx.user.userId },
                { $set: { lastManualRefreshAt: new Date() } },
            );
            const doc = await DailyBriefing.findOne({ userId: ctx.user.userId }).lean();
            return doc ? mapBriefing(doc) : null;
        },
        setSubscriptionTier: async (_: any, { userId, tier }: { userId: string; tier: string }, ctx: Ctx) => {
            if (!ctx.user) throw new Error('Unauthorized');
            if (ctx.user.role !== 'superuser') throw new Error('Forbidden: superuser only');
            if (!['free', 'plus', 'pro'].includes(tier)) throw new Error('Invalid tier');
            const target = await User.findById(userId).lean();
            if (!target) throw new Error('User not found');
            if (target.role === 'superuser' && tier !== 'pro') {
                throw new Error('Superusers are always Pro');
            }
            if (target.role === 'demo' && tier !== 'free') {
                throw new Error('Demo accounts are always on Free tier');
            }
            const user = await User.findByIdAndUpdate(
                userId,
                { subscriptionTier: tier },
                { new: true },
            ).lean();
            if (!user) throw new Error('User not found');
            const u: any = user;
            return {
                id: u._id.toString(),
                email: u.email,
                role: u.role,
                subscriptionTier: u.subscriptionTier ?? 'free',
                createdAt: u.createdAt instanceof Date ? u.createdAt.toISOString() : String(u.createdAt ?? ''),
                deviceCount: 0,
                plantCount: 0,
            };
        },
        adminCreateUser: async (_: any, { email, password, role, tier }: { email: string; password: string; role: string; tier: string }, ctx: Ctx) => {
            if (!ctx.user) throw new Error('Unauthorized');
            if (ctx.user.role !== 'superuser') throw new Error('Forbidden: superuser only');
            const trimmedEmail = email.trim().toLowerCase();
            if (!trimmedEmail) throw new Error('Email required');
            if (!password || password.length < 8) throw new Error('Password must be at least 8 characters');
            if (!['user', 'superuser', 'demo'].includes(role)) throw new Error('Invalid role');
            if (!['free', 'plus', 'pro'].includes(tier)) throw new Error('Invalid tier');
            const existing = await User.findOne({ email: trimmedEmail });
            if (existing) throw new Error('A user with that email already exists');
            // Role overrides tier: superuser is always pro, demo is always free.
            const finalTier = role === 'superuser' ? 'pro' : role === 'demo' ? 'free' : tier;
            const passwordHash = await hashPassword(password);
            const doc: any = await User.create({
                email: trimmedEmail,
                passwordHash,
                role: role as 'user' | 'superuser' | 'demo',
                subscriptionTier: finalTier as 'free' | 'plus' | 'pro',
            });
            return {
                id: doc._id.toString(),
                email: doc.email,
                role: doc.role,
                subscriptionTier: doc.subscriptionTier ?? 'free',
                createdAt: doc.createdAt instanceof Date ? doc.createdAt.toISOString() : new Date().toISOString(),
                deviceCount: 0,
                plantCount: 0,
            };
        },
        adminUpdateUser: async (_: any, { userId, email, role, tier }: { userId: string; email?: string; role?: string; tier?: string }, ctx: Ctx) => {
            if (!ctx.user) throw new Error('Unauthorized');
            if (ctx.user.role !== 'superuser') throw new Error('Forbidden: superuser only');
            const update: any = {};
            if (email !== undefined) {
                const e = email.trim().toLowerCase();
                if (!e) throw new Error('Email required');
                const dup = await User.findOne({ email: e, _id: { $ne: userId } });
                if (dup) throw new Error('A user with that email already exists');
                update.email = e;
            }
            if (role !== undefined) {
                if (!['user', 'superuser', 'demo'].includes(role)) throw new Error('Invalid role');
                // Don't allow demoting yourself from superuser (lockout protection)
                if (userId === ctx.user.userId && role !== 'superuser') {
                    throw new Error('Cannot demote your own superuser account');
                }
                // Don't allow demoting the last superuser
                if (role !== 'superuser') {
                    const target = await User.findById(userId).lean();
                    if (target?.role === 'superuser') {
                        const superCount = await User.countDocuments({ role: 'superuser' });
                        if (superCount <= 1) throw new Error('Cannot demote the last superuser');
                    }
                }
                update.role = role;
            }
            if (tier !== undefined) {
                if (!['free', 'plus', 'pro'].includes(tier)) throw new Error('Invalid tier');
                update.subscriptionTier = tier;
            }
            // Role overrides tier: superuser → pro, demo → free.
            if (update.role === 'superuser') update.subscriptionTier = 'pro';
            else if (update.role === 'demo') update.subscriptionTier = 'free';
            const user = await User.findByIdAndUpdate(userId, update, { new: true }).lean();
            if (!user) throw new Error('User not found');
            const u: any = user;
            return {
                id: u._id.toString(),
                email: u.email,
                role: u.role,
                subscriptionTier: u.subscriptionTier ?? 'free',
                createdAt: u.createdAt instanceof Date ? u.createdAt.toISOString() : String(u.createdAt ?? ''),
                deviceCount: 0,
                plantCount: 0,
            };
        },
        setPlantReminder: async (_: any, { plantId, actionType, intervalDays, enabled }: { plantId: string; actionType: ReminderActionType; intervalDays: number; enabled: boolean }, ctx: Ctx) => {
            if (!ctx.user) throw new Error('Unauthorized');
            const plant = await Plant.findOne({ _id: plantId, userId: ctx.user.userId });
            if (!plant) throw new Error('Plant not found');
            if (intervalDays < 1 || intervalDays > 365) throw new Error('Interval must be between 1 and 365 days');

            const existing = await PlantReminder.findOne({ plantId, userId: ctx.user.userId, actionType });
            const now = Date.now();
            // When enabling a reminder for the first time (or after disable), seed nextDueAt
            // relative to the most recent matching action so we don't immediately flag it overdue.
            let nextDueAt: Date;
            if (existing) {
                // Preserve the existing due date if interval didn't change; otherwise re-seed
                const intervalChanged = existing.intervalDays !== intervalDays;
                nextDueAt = intervalChanged ? new Date(now + intervalDays * 24 * 60 * 60 * 1000) : existing.nextDueAt;
            } else {
                const lastAction = await PlantAction.findOne({ plantId, userId: ctx.user.userId, type: actionType })
                    .sort({ createdAt: -1 }).lean();
                const baseTime = lastAction ? new Date(lastAction.createdAt).getTime() : now;
                nextDueAt = new Date(baseTime + intervalDays * 24 * 60 * 60 * 1000);
            }

            const doc = await PlantReminder.findOneAndUpdate(
                { plantId, userId: ctx.user.userId, actionType },
                { $set: { intervalDays, enabled, nextDueAt }, $setOnInsert: { plantId, userId: ctx.user.userId, actionType } },
                { upsert: true, new: true },
            ).lean();
            return mapReminder(doc);
        },
        removePlantReminder: async (_: any, { id }: { id: string }, ctx: Ctx) => {
            if (!ctx.user) throw new Error('Unauthorized');
            const result = await PlantReminder.findOneAndDelete({ _id: id, userId: ctx.user.userId });
            return result !== null;
        },
        snoozeReminder: async (_: any, { id, hours }: { id: string; hours?: number }, ctx: Ctx) => {
            if (!ctx.user) throw new Error('Unauthorized');
            const h = hours && hours > 0 ? Math.min(hours, 168) : 24;
            const doc = await PlantReminder.findOneAndUpdate(
                { _id: id, userId: ctx.user.userId },
                { $set: { snoozedUntil: new Date(Date.now() + h * 60 * 60 * 1000), lastNotifiedAt: null } },
                { new: true },
            ).lean();
            if (!doc) throw new Error('Reminder not found');
            return mapReminder(doc);
        },
        subscribeToPush: async (_: any, { subscription }: { subscription: { endpoint: string; p256dh: string; auth: string } }, ctx: Ctx) => {
            if (!ctx.user) throw new Error('Unauthorized');
            await PushSubscription.findOneAndUpdate(
                { userId: ctx.user.userId, endpoint: subscription.endpoint },
                { $set: { p256dh: subscription.p256dh, auth: subscription.auth }, $setOnInsert: { userId: ctx.user.userId, endpoint: subscription.endpoint } },
                { upsert: true },
            );
            return true;
        },
        unsubscribeFromPush: async (_: any, { endpoint }: { endpoint: string }, ctx: Ctx) => {
            if (!ctx.user) throw new Error('Unauthorized');
            await PushSubscription.deleteOne({ userId: ctx.user.userId, endpoint });
            return true;
        },
        adminDeleteUser: async (_: any, { userId }: { userId: string }, ctx: Ctx) => {
            if (!ctx.user) throw new Error('Unauthorized');
            if (ctx.user.role !== 'superuser') throw new Error('Forbidden: superuser only');
            if (userId === ctx.user.userId) throw new Error('Cannot delete your own account');
            const target = await User.findById(userId).lean();
            if (!target) throw new Error('User not found');
            if (target.role === 'superuser') {
                const superCount = await User.countDocuments({ role: 'superuser' });
                if (superCount <= 1) throw new Error('Cannot delete the last superuser');
            }
            await User.findByIdAndDelete(userId);
            return true;
        },
        openDeviceClaim: (_: any, __: any, ctx: Ctx) => {
            if (!ctx.user) throw new Error('Unauthorized');
            const expiresAt = openClaim(ctx.user.userId);
            return new Date(expiresAt).toISOString();
        },
        cancelDeviceClaim: (_: any, __: any, ctx: Ctx) => {
            if (!ctx.user) throw new Error('Unauthorized');
            return cancelClaim(ctx.user.userId);
        },
        renameDevice: async (_: any, { id, name }: { id: string; name: string }, ctx: Ctx) => {
            if (!ctx.user) throw new Error('Unauthorized');
            const doc = await Device.findOneAndUpdate(
                { _id: id, userId: ctx.user.userId },
                { name },
                { new: true }
            );
            if (!doc) throw new Error('Device not found');
            return mapDevice(doc);
        },
        removeDevice: async (_: any, { id }: { id: string }, ctx: Ctx) => {
            if (!ctx.user) throw new Error('Unauthorized');
            const result = await Device.findOneAndDelete({ _id: id, userId: ctx.user.userId });
            return result !== null;
        },
        updateUserSettings: async (
            _: any,
            args: {
                tempMin?: number | null;
                tempMax?: number | null;
                humidityMin?: number | null;
                humidityMax?: number | null;
                frostThreshold?: number | null;
                heatThreshold?: number | null;
                windThreshold?: number | null;
                digestTime?: string | null;
                digestEnabled?: boolean | null;
                alertsEnabled?: boolean | null;
                locale?: string | null;
                smartTipsEnabled?: boolean | null;
                morningTipTime?: string | null;
                eveningTipTime?: string | null;
                location?: { lat: number; lng: number; city?: string | null } | null;
            },
            ctx: Ctx
        ) => {
            if (!ctx.user) throw new Error('Unauthorized');

            const $set: any = {};
            const $unset: any = {};

            // null explicitly resets a field to default; undefined leaves it unchanged
            const apply = <T>(key: string, value: T | null | undefined, validate: (v: any) => boolean) => {
                if (value === null) $unset[key] = '';
                else if (value !== undefined && validate(value)) $set[key] = value;
            };

            apply('tempMin', args.tempMin, (v) => typeof v === 'number');
            apply('tempMax', args.tempMax, (v) => typeof v === 'number');
            apply('humidityMin', args.humidityMin, (v) => typeof v === 'number');
            apply('humidityMax', args.humidityMax, (v) => typeof v === 'number');
            apply('frostThreshold', args.frostThreshold, (v) => typeof v === 'number');
            apply('heatThreshold', args.heatThreshold, (v) => typeof v === 'number');
            apply('windThreshold', args.windThreshold, (v) => typeof v === 'number');
            apply('digestTime', args.digestTime, (v) => typeof v === 'string');
            apply('digestEnabled', args.digestEnabled, (v) => typeof v === 'boolean');
            apply('alertsEnabled', args.alertsEnabled, (v) => typeof v === 'boolean');
            apply('locale', args.locale, (v) => typeof v === 'string');
            apply('smartTipsEnabled', args.smartTipsEnabled, (v) => typeof v === 'boolean');
            apply('morningTipTime', args.morningTipTime, (v) => typeof v === 'string' && /^\d{2}:\d{2}$/.test(v));
            apply('eveningTipTime', args.eveningTipTime, (v) => typeof v === 'string' && /^\d{2}:\d{2}$/.test(v));
            apply('location', args.location, (v) => v && typeof v.lat === 'number' && typeof v.lng === 'number');

            const update: any = { $setOnInsert: { userId: ctx.user.userId } };
            if (Object.keys($set).length) update.$set = $set;
            if (Object.keys($unset).length) update.$unset = $unset;

            const settings = await UserSettings.findOneAndUpdate(
                { userId: ctx.user.userId },
                update,
                { upsert: true, new: true }
            ).lean();
            return {
                tempMin: settings?.tempMin ?? null,
                tempMax: settings?.tempMax ?? null,
                humidityMin: settings?.humidityMin ?? null,
                humidityMax: settings?.humidityMax ?? null,
                frostThreshold: settings?.frostThreshold ?? null,
                heatThreshold: settings?.heatThreshold ?? null,
                windThreshold: settings?.windThreshold ?? null,
                digestTime: settings?.digestTime ?? null,
                digestEnabled: settings?.digestEnabled ?? null,
                alertsEnabled: settings?.alertsEnabled ?? null,
                locale: settings?.locale ?? null,
                smartTipsEnabled: settings?.smartTipsEnabled ?? null,
                morningTipTime: settings?.morningTipTime ?? null,
                eveningTipTime: settings?.eveningTipTime ?? null,
                location: settings?.location
                    ? { lat: settings.location.lat, lng: settings.location.lng, city: settings.location.city ?? null }
                    : null,
            };
        },
    },

    SensorData: {
        lightStatus: (parent: any) => getLightStatus(parent.lightLevel, primaryPlantType),
        timestamp: (parent: any) =>
            parent.timestamp instanceof Date
                ? parent.timestamp.toISOString()
                : parent.timestamp,
    },

    HourlySensorData: {
        lightStatus: (parent: any) => getLightStatus(parent.avgLight, primaryPlantType),
    },

    Subscription: {
        sensorDataUpdated: {
            subscribe: () => pubsub.asyncIterator([SENSOR_DATA_CHANNEL]),
        },
        deviceClaimed: {
            subscribe: (_: any, { userId }: { userId: string }) =>
                pubsub.asyncIterator([deviceClaimedChannel(userId)]),
        },
    },
};
