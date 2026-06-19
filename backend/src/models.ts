import mongoose, { Schema, Document, Model } from 'mongoose';
import { PLANT_LIGHT_RANGES, PlantType } from './lightUtils';

const PLANT_TYPE_VALUES = Object.keys(PLANT_LIGHT_RANGES) as PlantType[];

// ── User ────────────────────────────────────────────────────────────────────

export type SubscriptionTier = 'free' | 'plus' | 'pro';

export type UserRole = 'superuser' | 'user' | 'demo';

export interface IUser extends Document {
    email: string;
    /** Empty string for Google-only accounts that never set a local password. */
    passwordHash: string;
    /** Google `sub` (stable subject ID) — present when the account was created or linked via Google sign-in. */
    googleId?: string;
    role: UserRole;
    subscriptionTier: SubscriptionTier;
    emailVerified: boolean;
}

const userSchema = new Schema<IUser>(
    {
        email: { type: String, required: true, unique: true },
        // Required only for accounts that don't use Google sign-in. Mongoose treats
        // an empty string as "missing" for plain `required: true`, so we use a
        // function-based check that lets Google-only accounts through.
        passwordHash: {
            type: String,
            default: '',
            required: function(this: IUser) { return !this.googleId; },
        },
        googleId: { type: String, index: true, sparse: true },
        role: { type: String, required: true, enum: ['superuser', 'user', 'demo'], default: 'user' },
        subscriptionTier: { type: String, required: true, enum: ['free', 'plus', 'pro'], default: 'free' },
        emailVerified: { type: Boolean, required: true, default: false },
    },
    { timestamps: true }
);

export const User = mongoose.model<IUser>('User', userSchema);

// ── PasswordResetToken ──────────────────────────────────────────────────────

export interface IPasswordResetToken extends Document {
    userId: string;
    tokenHash: string;
    expiresAt: Date;
    usedAt?: Date | null;
}

const passwordResetTokenSchema = new Schema<IPasswordResetToken>(
    {
        userId: { type: String, required: true, index: true },
        tokenHash: { type: String, required: true, unique: true },
        expiresAt: { type: Date, required: true },
        usedAt: { type: Date, default: null },
    },
    { timestamps: true }
);

export const PasswordResetToken = mongoose.model<IPasswordResetToken>('PasswordResetToken', passwordResetTokenSchema);

// ── EmailVerificationToken ──────────────────────────────────────────────────

export interface IEmailVerificationToken extends Document {
    userId: string;
    tokenHash: string;
    expiresAt: Date;
    usedAt?: Date | null;
}

const emailVerificationTokenSchema = new Schema<IEmailVerificationToken>(
    {
        userId: { type: String, required: true, index: true },
        tokenHash: { type: String, required: true, unique: true },
        expiresAt: { type: Date, required: true },
        usedAt: { type: Date, default: null },
    },
    { timestamps: true }
);

export const EmailVerificationToken = mongoose.model<IEmailVerificationToken>('EmailVerificationToken', emailVerificationTokenSchema);

// ── Plant ───────────────────────────────────────────────────────────────────

export type WaterAmount = 1 | 2 | 3;
export type WateringFrequency = 'once_week' | 'twice_week' | 'once_two_weeks' | 'other';
export type FertilizerFrequency = 'once_week' | 'once_two_weeks' | 'once_month' | 'other';

export interface IPlantCare {
    waterAmount?: WaterAmount;
    waterFrequency?: WateringFrequency;
    waterFrequencyOther?: string;
    fertilizerFrequency?: FertilizerFrequency;
    fertilizerFrequencyOther?: string;
    fertilizerType?: string;
}

export type HarvestRecommendation = 'yes' | 'maybe' | 'no';

export interface IHarvestSummary {
    taste: number;       // 1-5
    fertility: number;   // 1-5
    recommendation: HarvestRecommendation;
    notes?: string;
    archivedAt: Date;
}

export interface IPlant extends Document {
    name: string;
    type: PlantType;
    plantedDate: Date;
    count: number;
    monitored: boolean;
    archived: boolean;
    dailyLightHours: number;
    code?: string;
    userId?: string;
    care?: IPlantCare;
    harvestSummary?: IHarvestSummary;
}

const plantSchema = new Schema<IPlant>(
    {
        name: { type: String, required: true },
        type: { type: String, required: true, enum: PLANT_TYPE_VALUES },
        plantedDate: { type: Date, required: true },
        count: { type: Number, required: true, default: 1 },
        monitored: { type: Boolean, required: true, default: true },
        archived: { type: Boolean, required: true, default: false },
        dailyLightHours: { type: Number, required: true, default: 12 },
        code: { type: String, index: true },
        userId: { type: String, index: true },
        care: {
            waterAmount: { type: Number, min: 1, max: 3 },
            waterFrequency: { type: String, enum: ['once_week', 'twice_week', 'once_two_weeks', 'other'] },
            waterFrequencyOther: { type: String },
            fertilizerFrequency: { type: String, enum: ['once_week', 'once_two_weeks', 'once_month', 'other'] },
            fertilizerFrequencyOther: { type: String },
            fertilizerType: { type: String },
        },
        harvestSummary: {
            taste: { type: Number, min: 1, max: 5 },
            fertility: { type: Number, min: 1, max: 5 },
            recommendation: { type: String, enum: ['yes', 'maybe', 'no'] },
            notes: { type: String },
            archivedAt: { type: Date },
        },
    },
    { timestamps: true }
);

plantSchema.index({ userId: 1, code: 1 });

export const Plant = mongoose.model<IPlant>('Plant', plantSchema);

// ── PlantAction ─────────────────────────────────────────────────────────────

export type PlantActionType = 'water' | 'fertilize' | 'prune' | 'harvest' | 'bloom' | 'note';

export interface IPlantAction extends Document {
    plantId: string;
    userId: string;
    type: PlantActionType;
    note?: string;
    createdAt: Date;
    updatedAt: Date;
}

const plantActionSchema = new Schema<IPlantAction>(
    {
        plantId: { type: String, required: true, index: true },
        userId: { type: String, required: true, index: true },
        type: { type: String, required: true, enum: ['water', 'fertilize', 'prune', 'harvest', 'bloom', 'note'] },
        note: { type: String },
    },
    { timestamps: true }
);

plantActionSchema.index({ userId: 1, plantId: 1, createdAt: -1 });

export const PlantAction = mongoose.model<IPlantAction>('PlantAction', plantActionSchema);

// ── SmartTip ────────────────────────────────────────────────────────────────

export interface ISmartTip extends Document {
    plantId: string;
    userId: string;
    text: string;
    source: string;
    cycle?: BriefingCycle;
    generatedAt: Date;
}

const smartTipSchema = new Schema<ISmartTip>(
    {
        plantId: { type: String, required: true },
        userId: { type: String, required: true },
        text: { type: String, required: true },
        source: { type: String, required: true },
        cycle: { type: String, enum: ['morning', 'evening'] },
        generatedAt: { type: Date, required: true },
    },
    { timestamps: true }
);

smartTipSchema.index({ userId: 1, plantId: 1 }, { unique: true });

export const SmartTip = mongoose.model<ISmartTip>('SmartTip', smartTipSchema);

// ── HourlySensorData ────────────────────────────────────────────────────────

export interface IHourlySensorData extends Document {
    hour: Date;
    lightLevel: number;
    minLight: number;
    maxLight: number;
    avgLight: number;
    readingCount: number;
    avgTemperature?: number;
    minTemperature?: number;
    maxTemperature?: number;
    avgHumidity?: number;
    minHumidity?: number;
    maxHumidity?: number;
    avgPressure?: number;
    avgCo2?: number;
    userId?: string;
    deviceId?: string;
    createdAt: Date;
}

const hourlySensorDataSchema = new Schema<IHourlySensorData>(
    {
        hour: { type: Date, required: true },
        lightLevel: { type: Number, required: true },
        minLight: { type: Number, required: true },
        maxLight: { type: Number, required: true },
        avgLight: { type: Number, required: true },
        readingCount: { type: Number, required: true },
        avgTemperature: Number,
        minTemperature: Number,
        maxTemperature: Number,
        avgHumidity: Number,
        minHumidity: Number,
        maxHumidity: Number,
        avgPressure: Number,
        avgCo2: Number,
        userId: { type: String, index: true },
        deviceId: { type: String, index: true },
    },
    { timestamps: true }
);

// Compound uniqueness: one record per (user, hour). Was previously unique on hour alone.
hourlySensorDataSchema.index({ userId: 1, hour: 1 }, { unique: true });

export const HourlySensorData = mongoose.model<IHourlySensorData>(
    'HourlySensorData',
    hourlySensorDataSchema
);

// ── UserSettings ────────────────────────────────────────────────────────────
// One row per user. Holds per-user UI/alert thresholds that don't belong on the
// User record (which is auth-only). Created lazily on first write.

export interface IUserSettings extends Document {
    userId: string;
    /** Display name shown in greetings. Trimmed to 40 chars on save. */
    name?: string;
    tempMin?: number;
    tempMax?: number;
    humidityMin?: number;
    humidityMax?: number;
    frostThreshold?: number;
    heatThreshold?: number;
    windThreshold?: number;
    digestTime?: string;       // 'HH:MM' (24h)
    digestEnabled?: boolean;
    alertsEnabled?: boolean;
    locale?: string;           // 'en' | 'da' (extensible)
    smartTipsEnabled?: boolean;
    morningTipTime?: string;   // 'HH:MM'
    eveningTipTime?: string;   // 'HH:MM'
    timezone?: string;         // IANA zone (e.g. 'Europe/Copenhagen'); morning/evening times resolve against it
    location?: { lat: number; lng: number; city?: string };
    lastSmartTipRun?: { morning?: Date; evening?: Date };
    lastManualRefreshAt?: Date;
    createdAt: Date;
    updatedAt: Date;
}

const userSettingsSchema = new Schema<IUserSettings>(
    {
        userId: { type: String, required: true, unique: true, index: true },
        name: { type: String, maxlength: 40 },
        tempMin: { type: Number },
        tempMax: { type: Number },
        humidityMin: { type: Number },
        humidityMax: { type: Number },
        frostThreshold: { type: Number },
        heatThreshold: { type: Number },
        windThreshold: { type: Number },
        digestTime: { type: String },
        digestEnabled: { type: Boolean },
        alertsEnabled: { type: Boolean },
        locale: { type: String },
        smartTipsEnabled: { type: Boolean },
        morningTipTime: { type: String },
        eveningTipTime: { type: String },
        timezone: { type: String },
        location: {
            lat: { type: Number },
            lng: { type: Number },
            city: { type: String },
        },
        lastSmartTipRun: {
            morning: { type: Date },
            evening: { type: Date },
        },
        lastManualRefreshAt: { type: Date },
    },
    { timestamps: true }
);

export const UserSettings = mongoose.model<IUserSettings>('UserSettings', userSettingsSchema);

// ── AiUsage ─────────────────────────────────────────────────────────────────
// One row per Claude call so we can spot abuse and total spend without
// logging into the Anthropic dashboard. Pruned/aggregated later if it grows.

export interface IAiUsage extends Document {
    userId: string;
    cycle?: 'morning' | 'evening' | 'manual';
    source: string;
    plantCount: number;
    success: boolean;
    error?: string;
    createdAt: Date;
}

const aiUsageSchema = new Schema<IAiUsage>(
    {
        userId: { type: String, required: true, index: true },
        cycle: { type: String, enum: ['morning', 'evening', 'manual'] },
        source: { type: String, required: true },
        plantCount: { type: Number, required: true, default: 0 },
        success: { type: Boolean, required: true, default: true },
        error: { type: String },
    },
    { timestamps: true }
);

aiUsageSchema.index({ userId: 1, createdAt: -1 });

export const AiUsage = mongoose.model<IAiUsage>('AiUsage', aiUsageSchema);

// ── PlantReminder ───────────────────────────────────────────────────────────
// One row per plant per actionType. Storing intervalDays + nextDueAt rather
// than a cron expression keeps the model simple and makes "logging the
// action resets the timer" trivial — bump nextDueAt by intervalDays.

export type ReminderActionType = 'water' | 'fertilize' | 'note';

export interface IPlantReminder extends Document {
    plantId: string;
    userId: string;
    actionType: ReminderActionType;
    intervalDays: number;
    /** HH:mm in server local timezone. When unset, nextDueAt is "now + intervalDays" with no time anchoring. */
    notifyTime?: string;
    nextDueAt: Date;
    snoozedUntil?: Date;
    lastNotifiedAt?: Date;
    enabled: boolean;
    createdAt: Date;
    updatedAt: Date;
}

const plantReminderSchema = new Schema<IPlantReminder>(
    {
        plantId: { type: String, required: true, index: true },
        userId: { type: String, required: true, index: true },
        actionType: { type: String, required: true, enum: ['water', 'fertilize', 'note'] },
        intervalDays: { type: Number, required: true, min: 1, max: 365 },
        notifyTime: { type: String, match: /^([01]\d|2[0-3]):[0-5]\d$/ },
        nextDueAt: { type: Date, required: true },
        snoozedUntil: { type: Date },
        lastNotifiedAt: { type: Date },
        enabled: { type: Boolean, required: true, default: true },
    },
    { timestamps: true }
);

// One reminder per (user, plant, actionType) — toggling enabled keeps the row.
plantReminderSchema.index({ userId: 1, plantId: 1, actionType: 1 }, { unique: true });

export const PlantReminder = mongoose.model<IPlantReminder>('PlantReminder', plantReminderSchema);

// ── PushSubscription ────────────────────────────────────────────────────────
// One row per browser/device that's opted in. The endpoint is unique within
// the push service, so we use it as the natural dedupe key per user.

export interface IPushSubscription extends Document {
    userId: string;
    endpoint: string;
    p256dh: string;
    auth: string;
    createdAt: Date;
}

const pushSubscriptionSchema = new Schema<IPushSubscription>(
    {
        userId: { type: String, required: true, index: true },
        endpoint: { type: String, required: true },
        p256dh: { type: String, required: true },
        auth: { type: String, required: true },
    },
    { timestamps: true }
);

pushSubscriptionSchema.index({ userId: 1, endpoint: 1 }, { unique: true });

export const PushSubscription = mongoose.model<IPushSubscription>('PushSubscription', pushSubscriptionSchema);

// ── DailyBriefing ───────────────────────────────────────────────────────────

export type BriefingCycle = 'morning' | 'evening';

export interface IDailyBriefing extends Document {
    userId: string;
    cycle: BriefingCycle;
    overview: string;
    source: string;
    generatedAt: Date;
}

const dailyBriefingSchema = new Schema<IDailyBriefing>(
    {
        userId: { type: String, required: true, unique: true, index: true },
        cycle: { type: String, required: true, enum: ['morning', 'evening'] },
        overview: { type: String, required: true },
        source: { type: String, required: true },
        generatedAt: { type: Date, required: true },
    },
    { timestamps: true }
);

export const DailyBriefing = mongoose.model<IDailyBriefing>('DailyBriefing', dailyBriefingSchema);

// ── Shelly H&T Gen3 device ─────────────────────────────────────────────────────────────

export interface IShellyDevice extends Document {
    userId: string;
    deviceId: string;          // Shelly serial, e.g. "shellyhtg3-AABBCCDDEEFF"
    name: string;
    lastSeenAt?: Date;
    lastReportedAt?: Date;
    lastBatteryPercent?: number;
    createdAt: Date;
}

const shellyDeviceSchema = new Schema<IShellyDevice>(
    {
        userId: { type: String, required: true, index: true },
        deviceId: { type: String, required: true },
        name: { type: String, required: true },
        lastSeenAt: { type: Date },
        lastReportedAt: { type: Date },
        lastBatteryPercent: { type: Number, min: 0, max: 100 },
        createdAt: { type: Date, default: Date.now },
    },
    { collection: 'shelly_devices' }
);

shellyDeviceSchema.index({ deviceId: 1 }, { unique: true });

shellyDeviceSchema.index({ userId: 1, deviceId: 1 }, { unique: true });

export const ShellyDevice: Model<IShellyDevice> =
    mongoose.models.ShellyDevice || mongoose.model<IShellyDevice>('ShellyDevice', shellyDeviceSchema);

// ── Shelly Cloud account (one per user) ──────────────────────────────────────
export type ShellyAccountStatus = 'ok' | 'auth_error';

export interface IShellyAccount extends Document {
    userId: string;
    authKeyEnc: string;     // encrypted with crypto.ts; never returned via GraphQL
    serverHost: string;     // e.g. "shelly-XX-eu.shelly.cloud"
    status: ShellyAccountStatus;
    createdAt: Date;
}

const shellyAccountSchema = new Schema<IShellyAccount>(
    {
        userId: { type: String, required: true, unique: true, index: true },
        authKeyEnc: { type: String, required: true },
        serverHost: { type: String, required: true },
        status: { type: String, enum: ['ok', 'auth_error'], default: 'ok' },
        createdAt: { type: Date, default: Date.now },
    },
    { collection: 'shelly_accounts' }
);

export const ShellyAccount: Model<IShellyAccount> =
    mongoose.models.ShellyAccount || mongoose.model<IShellyAccount>('ShellyAccount', shellyAccountSchema);
