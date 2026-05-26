import mongoose, { Schema, Document } from 'mongoose';
import { PLANT_LIGHT_RANGES, PlantType } from './lightUtils';

const PLANT_TYPE_VALUES = Object.keys(PLANT_LIGHT_RANGES) as PlantType[];

// ── User ────────────────────────────────────────────────────────────────────

export interface IUser extends Document {
    email: string;
    passwordHash: string;
    role: 'superuser' | 'user';
}

const userSchema = new Schema<IUser>(
    {
        email: { type: String, required: true, unique: true },
        passwordHash: { type: String, required: true },
        role: { type: String, required: true, enum: ['superuser', 'user'], default: 'user' },
    },
    { timestamps: true }
);

export const User = mongoose.model<IUser>('User', userSchema);

// ── Plant ───────────────────────────────────────────────────────────────────

export interface IPlant extends Document {
    name: string;
    type: PlantType;
    plantedDate: Date;
    count: number;
    monitored: boolean;
    dailyLightHours: number;
    userId?: string;
}

const plantSchema = new Schema<IPlant>(
    {
        name: { type: String, required: true },
        type: { type: String, required: true, enum: PLANT_TYPE_VALUES },
        plantedDate: { type: Date, required: true },
        count: { type: Number, required: true, default: 1 },
        monitored: { type: Boolean, required: true, default: true },
        dailyLightHours: { type: Number, required: true, default: 12 },
        userId: { type: String, index: true },
    },
    { timestamps: true }
);

export const Plant = mongoose.model<IPlant>('Plant', plantSchema);

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
    digestTime?: string;       // 'HH:MM' (24h)
    digestEnabled?: boolean;
    alertsEnabled?: boolean;
    locale?: string;           // 'en' | 'da' (extensible)
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
        digestTime: { type: String },
        digestEnabled: { type: Boolean },
        alertsEnabled: { type: Boolean },
        locale: { type: String },
    },
    { timestamps: true }
);

export const UserSettings = mongoose.model<IUserSettings>('UserSettings', userSettingsSchema);
