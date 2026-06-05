import { v4 as uuidv4 } from 'uuid';
import * as crypto from 'crypto';
import { pubsub, SENSOR_DATA_CHANNEL, deviceClaimedChannel } from './pubsub';
import { SensorData } from './types';
import { HourlySensorData, Plant, User, Device, UserSettings, PlantAction, PlantActionType, DailyBriefing, PlantReminder, PushSubscription, ReminderActionType, PasswordResetToken, EmailVerificationToken, SmartTip, AiUsage } from './models';
import type { EmailLocale } from './services/emailSender';
import { SmartTipService, StubLlmProvider, LlmProvider } from './services/smartTip';
import { getLightStatus, PlantType } from './lightUtils';
import { signToken, verifyPassword, hashPassword, JwtPayload } from './auth';
import { pushReading, getAll as getAllReadings, getAllForUser as getReadingsForUser } from './sensorStore';
import { sendPasswordResetEmail, sendEmailVerificationEmail } from './services/emailSender';

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
        code: doc.code ?? null,
        care: doc.care && (doc.care.waterAmount || doc.care.waterFrequency || doc.care.fertilizerAmount || doc.care.fertilizerFrequency || doc.care.fertilizerType)
            ? {
                waterAmount: doc.care.waterAmount ?? null,
                waterFrequency: doc.care.waterFrequency ?? null,
                waterFrequencyOther: doc.care.waterFrequencyOther ?? null,
                fertilizerAmount: doc.care.fertilizerAmount ?? null,
                fertilizerFrequency: doc.care.fertilizerFrequency ?? null,
                fertilizerType: doc.care.fertilizerType ?? null,
            }
            : null,
        harvestSummary: doc.harvestSummary && doc.harvestSummary.taste
            ? {
                taste: doc.harvestSummary.taste,
                fertility: doc.harvestSummary.fertility,
                recommendation: doc.harvestSummary.recommendation,
                notes: doc.harvestSummary.notes ?? null,
                archivedAt: dateAsString(doc.harvestSummary.archivedAt ?? new Date()),
            }
            : null,
    };
}

interface PlantCareInput {
    waterAmount?: number;
    waterFrequency?: string;
    waterFrequencyOther?: string;
    fertilizerAmount?: number;
    fertilizerFrequency?: string;
    fertilizerType?: string;
}

interface HarvestSummaryInput {
    taste: number;
    fertility: number;
    recommendation: 'yes' | 'maybe' | 'no';
    notes?: string;
}

/**
 * Builds a human-friendly identifier for a new plant, scoped per user per type.
 * Format: <3-letter type prefix>-<zero-padded sequence>, e.g. TOM-01.
 * Sequence never reuses — if TOM-01/02/03 exist and 02 is deleted, the next
 * tomato is still TOM-04.
 */
async function generatePlantCode(userId: string, type: PlantType): Promise<string> {
    const prefix = type.slice(0, 3).toUpperCase();
    const existing = await Plant.find({ userId, type, code: { $regex: `^${prefix}-` } })
        .select('code').lean();
    let maxSeq = 0;
    for (const p of existing) {
        const match = /^[A-Z]{3}-(\d+)$/.exec((p as any).code ?? '');
        if (match) maxSeq = Math.max(maxSeq, parseInt(match[1], 10));
    }
    const next = maxSeq + 1;
    return `${prefix}-${String(next).padStart(2, '0')}`;
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
    // Legacy testing rows may have fractional intervalDays (sub-day intervals
    // were briefly supported). Coerce to a whole number ≥ 1 so the GraphQL
    // Int! return type doesn't reject the response.
    const intervalDays = Math.max(1, Math.round(Number(doc.intervalDays) || 1));
    return {
        id: doc._id.toString(),
        plantId: doc.plantId,
        actionType: doc.actionType,
        intervalDays,
        notifyTime: doc.notifyTime ?? null,
        nextDueAt: doc.nextDueAt instanceof Date ? doc.nextDueAt.toISOString() : String(doc.nextDueAt),
        snoozedUntil: doc.snoozedUntil instanceof Date ? doc.snoozedUntil.toISOString() : (doc.snoozedUntil ?? null),
        enabled: doc.enabled,
    };
}

/**
 * Compute the next due timestamp. If notifyTime (HH:mm) is provided, the
 * result lands on the next day-of-interval AT that wall-clock time in the
 * server's local timezone. Without notifyTime we just add the interval to
 * `from` and keep the time-of-day unchanged.
 */
function computeNextDueAt(intervalDays: number, from: Date, notifyTime?: string | null): Date {
    if (!notifyTime || !/^([01]\d|2[0-3]):[0-5]\d$/.test(notifyTime)) {
        return new Date(from.getTime() + intervalDays * 24 * 60 * 60 * 1000);
    }
    const [hh, mm] = notifyTime.split(':').map(Number);
    if (intervalDays === 1) {
        // Daily: next occurrence of HH:mm from `from`. If it hasn't happened
        // today yet, fire today; otherwise tomorrow.
        const target = new Date(from);
        target.setHours(hh, mm, 0, 0);
        if (target.getTime() <= from.getTime()) {
            target.setDate(target.getDate() + 1);
        }
        return target;
    }
    // Multi-day: anchor to (from + intervalDays) at HH:mm.
    const target = new Date(from);
    target.setDate(target.getDate() + intervalDays);
    target.setHours(hh, mm, 0, 0);
    return target;
}

/**
 * Hard-delete a user and every per-user document they own. Used by both
 * deleteMyAccount (self-serve) and adminDeleteUser (superuser). Done in
 * parallel — none depend on each other; the User doc is removed last so a
 * partial failure leaves the account intact and retryable.
 */
export async function cascadeDeleteUser(userId: string): Promise<void> {
    await Promise.all([
        Plant.deleteMany({ userId }),
        PlantAction.deleteMany({ userId }),
        PlantReminder.deleteMany({ userId }),
        PushSubscription.deleteMany({ userId }),
        PasswordResetToken.deleteMany({ userId }),
        EmailVerificationToken.deleteMany({ userId }),
        Device.deleteMany({ userId }),
        DailyBriefing.deleteMany({ userId }),
        SmartTip.deleteMany({ userId }),
        AiUsage.deleteMany({ userId }),
        HourlySensorData.deleteMany({ userId }),
        UserSettings.deleteMany({ userId }),
    ]);
    await User.deleteOne({ _id: userId });
}

/**
 * Invalidate any prior unused verification tokens, mint a new one (24h expiry),
 * and send the verification email. Centralised so register, refresh, and
 * "Send again" all behave identically.
 */
async function issueVerificationEmail(userId: string, email: string, locale: EmailLocale): Promise<void> {
    await EmailVerificationToken.updateMany(
        { userId, usedAt: null },
        { $set: { usedAt: new Date() } }
    );
    const rawToken = crypto.randomBytes(32).toString('hex');
    const tokenHash = crypto.createHash('sha256').update(rawToken).digest('hex');
    const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000);
    await EmailVerificationToken.create({ userId, tokenHash, expiresAt });
    const baseUrl = process.env.FRONTEND_URL || 'http://localhost:4200';
    const verifyUrl = `${baseUrl}/verify-email?token=${rawToken}`;
    await sendEmailVerificationEmail(email, verifyUrl, locale);
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
                emailVerified: user.emailVerified ?? false,
            };
        },
    },

    Mutation: {
        login: async (_: any, { email, password }: { email: string; password: string }) => {
            const trimmedEmail = email.trim().toLowerCase();
            const user = await User.findOne({ email: trimmedEmail });
            // Throw error messages as i18n keys so the frontend can translate
            // them. Differentiates the two failures (user enumeration is fine
            // here — the product surfaces it deliberately for clearer UX).
            if (!user) throw new Error('auth.userNotFound');
            if (!(await verifyPassword(password, user.passwordHash))) {
                throw new Error('auth.invalidPassword');
            }
            // Block login until the email has been verified. The frontend
            // catches this key and offers an inline "resend verification"
            // button (calls resendVerificationEmail which doesn't require auth).
            if (!user.emailVerified) {
                throw new Error('auth.emailNotVerified');
            }
            const userId = user._id.toString();
            const token = signToken({ userId, email: user.email, role: user.role });
            return { token, email: user.email, role: user.role, userId, subscriptionTier: user.subscriptionTier ?? 'free', emailVerified: user.emailVerified ?? false };
        },
        requestPasswordReset: async (_: any, { email }: { email: string }) => {
            const trimmedEmail = email.trim().toLowerCase();
            const user = await User.findOne({ email: trimmedEmail });
            // Always return true — never leak whether the account exists.
            if (!user) return true;
            const userId = user._id.toString();
            // Invalidate any prior unused tokens for this user.
            await PasswordResetToken.updateMany(
                { userId, usedAt: null },
                { $set: { usedAt: new Date() } }
            );
            const rawToken = crypto.randomBytes(32).toString('hex');
            const tokenHash = crypto.createHash('sha256').update(rawToken).digest('hex');
            const expiresAt = new Date(Date.now() + 60 * 60 * 1000); // 1 hour
            await PasswordResetToken.create({ userId, tokenHash, expiresAt });
            const baseUrl = process.env.FRONTEND_URL || 'http://localhost:4200';
            const resetUrl = `${baseUrl}/reset-password?token=${rawToken}`;
            const settings = await UserSettings.findOne({ userId }).lean();
            const locale: EmailLocale = settings?.locale === 'en' ? 'en' : 'da';
            await sendPasswordResetEmail(trimmedEmail, resetUrl, locale);
            return true;
        },
        resetPassword: async (_: any, { token, newPassword }: { token: string; newPassword: string }) => {
            if (!token) throw new Error('Reset token is required');
            if (!newPassword || newPassword.length < 8) {
                throw new Error('Password must be at least 8 characters');
            }
            const tokenHash = crypto.createHash('sha256').update(token).digest('hex');
            const record = await PasswordResetToken.findOne({ tokenHash });
            if (!record) throw new Error('Invalid or expired reset link');
            if (record.usedAt) throw new Error('This reset link has already been used');
            if (record.expiresAt.getTime() < Date.now()) {
                throw new Error('This reset link has expired');
            }
            const user = await User.findById(record.userId);
            if (!user) throw new Error('Account not found');
            user.passwordHash = await hashPassword(newPassword);
            await user.save();
            record.usedAt = new Date();
            await record.save();
            return true;
        },
        requestEmailVerification: async (_: any, __: unknown, ctx: Ctx) => {
            if (!ctx.user) throw new Error('Unauthorized');
            const user = await User.findById(ctx.user.userId).lean();
            if (!user) throw new Error('Unauthorized');
            if (user.emailVerified) return true; // No-op if already verified.
            const settings = await UserSettings.findOne({ userId: ctx.user.userId }).lean();
            const locale: EmailLocale = settings?.locale === 'en' ? 'en' : 'da';
            await issueVerificationEmail(ctx.user.userId, user.email, locale);
            return true;
        },
        resendVerificationEmail: async (_: any, { email }: { email: string }) => {
            // Unauthenticated — needed because users who can't log in (because
            // they're unverified) need a way to get the email re-sent. Always
            // returns true so this can't be used to enumerate accounts.
            const trimmedEmail = email.trim().toLowerCase();
            const user = await User.findOne({ email: trimmedEmail });
            if (!user || user.emailVerified) return true;
            const settings = await UserSettings.findOne({ userId: user._id.toString() }).lean();
            const locale: EmailLocale = settings?.locale === 'en' ? 'en' : 'da';
            try {
                await issueVerificationEmail(user._id.toString(), user.email, locale);
            } catch (err) {
                console.error('resendVerificationEmail failed:', err);
                // Still return true — don't leak the failure.
            }
            return true;
        },
        verifyEmail: async (_: any, { token }: { token: string }) => {
            if (!token) throw new Error('Verification token is required');
            const tokenHash = crypto.createHash('sha256').update(token).digest('hex');
            const record = await EmailVerificationToken.findOne({ tokenHash });
            if (!record) throw new Error('Invalid or expired verification link');
            if (record.usedAt) throw new Error('This verification link has already been used');
            if (record.expiresAt.getTime() < Date.now()) {
                throw new Error('This verification link has expired');
            }
            const user = await User.findById(record.userId);
            if (!user) throw new Error('Account not found');
            user.emailVerified = true;
            await user.save();
            record.usedAt = new Date();
            await record.save();
            return true;
        },
        deleteMyAccount: async (_: any, { password }: { password: string }, ctx: Ctx) => {
            if (!ctx.user) throw new Error('Unauthorized');
            // Demo accounts are shared/illustrative — deletion would erase the
            // canonical sample data for everyone else. Block at the resolver.
            if (ctx.user.role === 'demo') throw new Error('account.demoCannotDelete');
            const user = await User.findById(ctx.user.userId);
            if (!user) throw new Error('account.notFound');
            if (!(await verifyPassword(password, user.passwordHash))) {
                throw new Error('auth.invalidPassword');
            }
            await cascadeDeleteUser(ctx.user.userId);
            return true;
        },
        register: async (_: any, { email, password }: { email: string; password: string }) => {
            const trimmedEmail = email.trim().toLowerCase();
            if (!trimmedEmail || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(trimmedEmail)) {
                throw new Error('Please enter a valid email address');
            }
            if (!password || password.length < 8) {
                throw new Error('Password must be at least 8 characters');
            }
            const existing = await User.findOne({ email: trimmedEmail });
            if (existing) throw new Error('An account with that email already exists');
            const passwordHash = await hashPassword(password);
            const doc: any = await User.create({
                email: trimmedEmail,
                passwordHash,
                role: 'user',
                subscriptionTier: 'free',
                emailVerified: false,
            });
            const userId = doc._id.toString();
            // Fire the verification email — best effort, don't block signup on failure.
            issueVerificationEmail(userId, doc.email, 'da').catch(err =>
                console.error('verification email on register failed:', err)
            );
            const token = signToken({ userId, email: doc.email, role: doc.role });
            return { token, email: doc.email, role: doc.role, userId, subscriptionTier: doc.subscriptionTier ?? 'free', emailVerified: false };
        },
        addPlant: async (_: any, { name, type, plantedDate, count, dailyLightHours = 12, care }: { name: string; type: PlantType; plantedDate: string; count: number; dailyLightHours?: number; care?: PlantCareInput }, ctx: Ctx) => {
            if (!ctx.user) throw new Error('Unauthorized');
            const code = await generatePlantCode(ctx.user.userId, type);
            const doc = await Plant.create({ name, type, plantedDate: new Date(plantedDate), count, monitored: true, dailyLightHours, code, userId: ctx.user.userId, care: care as any });
            await refreshPrimaryPlant();
            return mapPlant(doc);
        },
        updatePlant: async (_: any, { id, name, type, plantedDate, count, dailyLightHours = 12, care }: { id: string; name: string; type: PlantType; plantedDate: string; count: number; dailyLightHours?: number; care?: PlantCareInput }, ctx: Ctx) => {
            if (!ctx.user) throw new Error('Unauthorized');
            const update: any = { name, type, plantedDate: new Date(plantedDate), count, dailyLightHours };
            if (care !== undefined) update.care = care;
            const doc = await Plant.findOneAndUpdate(
                { _id: id, userId: ctx.user.userId },
                update,
                { new: true }
            );
            if (!doc) throw new Error('Plant not found');
            await refreshPrimaryPlant();
            return mapPlant(doc);
        },
        archivePlantWithSummary: async (_: any, { id, summary }: { id: string; summary: HarvestSummaryInput }, ctx: Ctx) => {
            if (!ctx.user) throw new Error('Unauthorized');
            if (summary.taste < 1 || summary.taste > 5) throw new Error('Invalid taste rating');
            if (summary.fertility < 1 || summary.fertility > 5) throw new Error('Invalid fertility rating');
            if (!['yes', 'maybe', 'no'].includes(summary.recommendation)) throw new Error('Invalid recommendation');
            const doc = await Plant.findOneAndUpdate(
                { _id: id, userId: ctx.user.userId },
                {
                    archived: true,
                    harvestSummary: {
                        taste: summary.taste,
                        fertility: summary.fertility,
                        recommendation: summary.recommendation,
                        notes: summary.notes,
                        archivedAt: new Date(),
                    },
                },
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
            if (type === 'water' || type === 'fertilize' || type === 'note') {
                const reminder = await PlantReminder.findOne({
                    plantId, userId: ctx.user.userId, actionType: type, enabled: true,
                });
                if (reminder) {
                    reminder.nextDueAt = computeNextDueAt(reminder.intervalDays, new Date(), reminder.notifyTime);
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
        setPlantReminder: async (_: any, { plantId, actionType, intervalDays, enabled, notifyTime }: { plantId: string; actionType: ReminderActionType; intervalDays: number; enabled: boolean; notifyTime?: string | null }, ctx: Ctx) => {
            if (!ctx.user) throw new Error('Unauthorized');
            const plant = await Plant.findOne({ _id: plantId, userId: ctx.user.userId });
            if (!plant) throw new Error('Plant not found');
            if (!Number.isInteger(intervalDays) || intervalDays < 1 || intervalDays > 365) {
                throw new Error('Interval must be a whole number between 1 and 365 days');
            }
            if (notifyTime && !/^([01]\d|2[0-3]):[0-5]\d$/.test(notifyTime)) {
                throw new Error('notifyTime must be in HH:mm 24-hour format');
            }

            const existing = await PlantReminder.findOne({ plantId, userId: ctx.user.userId, actionType });
            const now = new Date();
            // Re-seed nextDueAt when the interval or notify time changes, or when seeding fresh.
            let nextDueAt: Date;
            const settingsChanged = !existing
                || existing.intervalDays !== intervalDays
                || (existing.notifyTime ?? null) !== (notifyTime ?? null);
            if (existing && !settingsChanged) {
                nextDueAt = existing.nextDueAt;
            } else if (existing) {
                nextDueAt = computeNextDueAt(intervalDays, now, notifyTime);
            } else {
                const lastAction = await PlantAction.findOne({ plantId, userId: ctx.user.userId, type: actionType })
                    .sort({ createdAt: -1 }).lean();
                const baseTime = lastAction ? new Date(lastAction.createdAt) : now;
                nextDueAt = computeNextDueAt(intervalDays, baseTime, notifyTime);
            }

            const doc = await PlantReminder.findOneAndUpdate(
                { plantId, userId: ctx.user.userId, actionType },
                {
                    $set: { intervalDays, enabled, nextDueAt, notifyTime: notifyTime ?? null },
                    $setOnInsert: { plantId, userId: ctx.user.userId, actionType },
                },
                { upsert: true, new: true },
            ).lean();
            return mapReminder(doc);
        },
        disableAllReminders: async (_: any, __: unknown, ctx: Ctx) => {
            if (!ctx.user) throw new Error('Unauthorized');
            const result = await PlantReminder.updateMany(
                { userId: ctx.user.userId, enabled: true },
                { $set: { enabled: false } },
            );
            return result.modifiedCount ?? 0;
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
            // Full cascade — plants, actions, reminders, sensor history, tokens,
            // everything. Same helper as the self-serve deletion.
            await cascadeDeleteUser(userId);
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
