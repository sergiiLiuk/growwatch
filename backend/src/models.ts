import mongoose, { Schema, Document } from 'mongoose';
import { PLANT_LIGHT_RANGES, PlantType } from './lightUtils';

const PLANT_TYPE_VALUES = Object.keys(PLANT_LIGHT_RANGES) as PlantType[];

export interface IPlant extends Document {
    name: string;
    type: PlantType;
    plantedDate: Date;
    count: number;
}

const plantSchema = new Schema<IPlant>(
    {
        name: { type: String, required: true },
        type: { type: String, required: true, enum: PLANT_TYPE_VALUES },
        plantedDate: { type: Date, required: true },
        count: { type: Number, required: true, default: 1 },
    },
    { timestamps: true }
);

export const Plant = mongoose.model<IPlant>('Plant', plantSchema);

export interface IHourlySensorData extends Document {
    hour: Date;
    lightLevel: number;
    minLight: number;
    maxLight: number;
    avgLight: number;
    readingCount: number;
    createdAt: Date;
}

const hourlySensorDataSchema = new Schema<IHourlySensorData>(
    {
        hour: { type: Date, required: true, unique: true },
        lightLevel: { type: Number, required: true },
        minLight: { type: Number, required: true },
        maxLight: { type: Number, required: true },
        avgLight: { type: Number, required: true },
        readingCount: { type: Number, required: true },
    },
    { timestamps: true }
);

export const HourlySensorData = mongoose.model<IHourlySensorData>(
    'HourlySensorData',
    hourlySensorDataSchema
);
