import { v4 as uuidv4 } from 'uuid';
import { pubsub, SENSOR_DATA_CHANNEL } from './pubsub';
import { SensorData } from './types';
import { HourlySensorData, Plant } from './models';
import { getLightStatus, PlantType } from './lightUtils';

// In-memory storage for sensor readings
let sensorDataStore: SensorData[] = [];
let lastSavedHour: number = -1;

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

// Function to save hourly aggregated data to MongoDB
export async function saveHourlyData() {
    if (hourAccum.light.length === 0) {
        console.log('⚠️ No readings to save');
        return;
    }

    const now = new Date();
    const hourStart = new Date(now.getFullYear(), now.getMonth(), now.getDate(), now.getHours(), 0, 0, 0);

    try {
        const update: any = {
            hour: hourStart,
            lightLevel: hourAccum.light[hourAccum.light.length - 1],
            minLight: Math.min(...hourAccum.light),
            maxLight: Math.max(...hourAccum.light),
            avgLight: avg(hourAccum.light),
            readingCount: hourAccum.light.length,
        };

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

        await HourlySensorData.findOneAndUpdate(
            { hour: hourStart },
            update,
            { upsert: true, new: true }
        );

        console.log('💾 Hourly data saved to MongoDB');
    } catch (error) {
        console.error('❌ Error saving hourly data:', error);
    }
}

// Function to handle incoming sensor data from ESP32
export function handleSensorData(data: any): SensorData {
    const sensorData: SensorData = {
        id: uuidv4(),
        lightLevel: data.lightLevel,
        timestamp: new Date(),
        temperature: data.temperature ?? undefined,
        humidity: data.humidity ?? undefined,
        pressure: data.pressure ?? undefined,
        co2: data.co2 ?? undefined,
    };

    sensorDataStore.push(sensorData);
    hourAccum.light.push(data.lightLevel);
    if (data.temperature != null) hourAccum.temperature.push(data.temperature);
    if (data.humidity    != null) hourAccum.humidity.push(data.humidity);
    if (data.pressure    != null) hourAccum.pressure.push(data.pressure);
    if (data.co2         != null) hourAccum.co2.push(data.co2);

    pubsub.publish(SENSOR_DATA_CHANNEL, {
        sensorDataUpdated: sensorData,
    });

    if (sensorDataStore.length > 100) {
        sensorDataStore = sensorDataStore.slice(-100);
    }

    return sensorData;
}

export async function initPlantCache() {
    await refreshPrimaryPlant();
}

// Check every minute if we need to save hourly data
export function startHourlyAggregation() {
    setInterval(async () => {
        const now = new Date();
        const nowHour = now.getHours();

        // Save data at the start of each new hour
        if (lastSavedHour !== nowHour && now.getMinutes() === 0) {
            await saveHourlyData();
            lastSavedHour = nowHour;
            hourAccum = { light: [], temperature: [], humidity: [], pressure: [], co2: [] };
        }
    }, 60000); // Check every minute
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
    };
}

export const resolvers = {
    Query: {
        sensorData: (): SensorData[] => {
            return sensorDataStore.slice(-10);
        },
        latestSensorData: (): SensorData | null => {
            return sensorDataStore.length > 0
                ? sensorDataStore[sensorDataStore.length - 1]
                : null;
        },
        hourlyData: async (_: any, { limit = 24 }: { limit?: number }) => {
            try {
                const data = await HourlySensorData.find()
                    .sort({ hour: -1 })
                    .limit(limit)
                    .lean();
                return data.map(mapHourlyDoc);
            } catch (error) {
                console.error('❌ Error fetching hourly data:', error);
                return [];
            }
        },
        hourlyDataRange: async (_: any, { from, to }: { from: string; to: string }) => {
            try {
                const data = await HourlySensorData.find({
                    hour: { $gte: new Date(from), $lte: new Date(to) },
                }).sort({ hour: 1 }).lean();
                return data.map(mapHourlyDoc);
            } catch (error) {
                console.error('❌ Error fetching hourly data range:', error);
                return [];
            }
        },
        plants: async () => {
            const docs = await Plant.find().sort({ createdAt: 1 }).lean();
            return docs.map((d: any) => ({
                id: d._id.toString(),
                name: d.name,
                type: d.type,
                plantedDate: d.plantedDate.toISOString(),
                count: d.count ?? 1,
                monitored: d.monitored ?? true,
                dailyLightHours: d.dailyLightHours ?? 12,
            }));
        },
    },

    Mutation: {
        addPlant: async (_: any, { name, type, plantedDate, count, dailyLightHours = 12 }: { name: string; type: PlantType; plantedDate: string; count: number; dailyLightHours?: number }) => {
            const doc = await Plant.create({ name, type, plantedDate: new Date(plantedDate), count, monitored: true, dailyLightHours });
            await refreshPrimaryPlant();
            return { id: doc._id.toString(), name: doc.name, type: doc.type, plantedDate: doc.plantedDate.toISOString(), count: doc.count, monitored: doc.monitored, dailyLightHours: doc.dailyLightHours };
        },
        updatePlant: async (_: any, { id, name, type, plantedDate, count, dailyLightHours = 12 }: { id: string; name: string; type: PlantType; plantedDate: string; count: number; dailyLightHours?: number }) => {
            const doc = await Plant.findByIdAndUpdate(id, { name, type, plantedDate: new Date(plantedDate), count, dailyLightHours }, { new: true });
            if (!doc) throw new Error('Plant not found');
            await refreshPrimaryPlant();
            return { id: doc._id.toString(), name: doc.name, type: doc.type, plantedDate: doc.plantedDate.toISOString(), count: doc.count, monitored: doc.monitored, dailyLightHours: doc.dailyLightHours };
        },
        setPlantMonitored: async (_: any, { id, monitored }: { id: string; monitored: boolean }) => {
            const doc = await Plant.findByIdAndUpdate(id, { monitored }, { new: true });
            if (!doc) throw new Error('Plant not found');
            await refreshPrimaryPlant();
            return { id: doc._id.toString(), name: doc.name, type: doc.type, plantedDate: doc.plantedDate.toISOString(), count: doc.count, monitored: doc.monitored, dailyLightHours: doc.dailyLightHours ?? 12 };
        },
        removePlant: async (_: any, { id }: { id: string }) => {
            const result = await Plant.findByIdAndDelete(id);
            await refreshPrimaryPlant();
            return result !== null;
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
    },
};
