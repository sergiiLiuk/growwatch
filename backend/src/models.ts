import mongoose, { Schema, Document } from 'mongoose';
import { PLANT_LIGHT_RANGES, PlantType } from './lightUtils';

const PLANT_TYPE_VALUES = Object.keys(PLANT_LIGHT_RANGES) as PlantType[];

// ── User ────────────────────────────────────────────────────────────────────

export type SubscriptionTier = 'free' | 'plus' | 'pro';

export type UserRole = 'superuser' | 'user' | 'demo';

export interface IUser extends Document {
    email: string;
    passwordHash: string;
    role: UserRole;
    subscriptionTier: SubscriptionTier;
}

const userSchema = new Schema<IUser>(
    {
        email: { type: String, required: true, unique: true },
        passwordHash: { type: String, required: true },
        role: { type: String, required: true, enum: ['superuser', 'user', 'demo'], default: 'user' },
        subscriptionTier: { type: String, required: true, enum: ['free', 'plus', 'pro'], default: 'free' },
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

// ── Plant ───────────────────────────────────────────────────────────────────

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

// ── Device ──────────────────────────────────────────────────────────────────

export interface IDevice extends Document {
    mac: string;
    userId: string;
    name: string;
    lastSeenAt?: Date;
    createdAt: Date;
}

const deviceSchema = new Schema<IDevice>(
    {
        mac: { type: String, required: true, unique: true, index: true },
        userId: { type: String, required: true, index: true },
        name: { type: String, required: true },
        lastSeenAt: { type: Date },
    },
    { timestamps: true }
);

export const Device = mongoose.model<IDevice>('Device', deviceSchema);

// ── UserSettings ────────────────────────────────────────────────────────────
// One row per user. Holds per-user UI/alert thresholds that don't belong on the
// User record (which is auth-only). Created lazily on first write.

export interface IUserSettings extends Document {
    userId: string;
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
    location?: { lat: number; lng: number; city?: string };
    lastSmartTipRun?: { morning?: Date; evening?: Date };
    lastManualRefreshAt?: Date;
    createdAt: Date;
    updatedAt: Date;
}

const userSettingsSchema = new Schema<IUserSettings>(
    {
        userId: { type: String, required: true, unique: true, index: true },
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
