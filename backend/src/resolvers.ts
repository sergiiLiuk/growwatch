import { v4 as uuidv4 } from 'uuid';
import { pubsub, SENSOR_DATA_CHANNEL } from './pubsub';
import { SensorData } from './types';
import { HourlySensorData, Plant } from './models';
import { getLightStatus, PlantType } from './lightUtils';

// In-memory storage for light sensor readings
let sensorDataStore: SensorData[] = [];
let currentHourReadings: number[] = [];
let lastSavedHour: number = -1;

// Cached plant type for lightStatus calculations — updated on every plant mutation
let primaryPlantType: PlantType = 'TOMATO';

async function refreshPrimaryPlant() {
    const doc = await Plant.findOne().sort({ createdAt: 1 }).lean();
    if (doc) primaryPlantType = doc.type as PlantType;
}

// Function to save hourly aggregated data to MongoDB
export async function saveHourlyData() {
    if (currentHourReadings.length === 0) {
        console.log('⚠️ No readings to save');
        return;
    }

    const now = new Date();
    const hourStart = new Date(now.getFullYear(), now.getMonth(), now.getDate(), now.getHours(), 0, 0, 0);

    try {
        const minLight = Math.min(...currentHourReadings);
        const maxLight = Math.max(...currentHourReadings);
        const avgLight = currentHourReadings.reduce((a, b) => a + b, 0) / currentHourReadings.length;

        await HourlySensorData.findOneAndUpdate(
            { hour: hourStart },
            {
                hour: hourStart,
                lightLevel: currentHourReadings[currentHourReadings.length - 1],
                minLight,
                maxLight,
                avgLight,
                readingCount: currentHourReadings.length,
            },
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
    };

    sensorDataStore.push(sensorData);
    currentHourReadings.push(data.lightLevel);

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
        const currentHour = now.getHours();

        // Save data at the start of each new hour
        if (lastSavedHour !== currentHour && now.getMinutes() === 0) {
            await saveHourlyData();
            lastSavedHour = currentHour;
            currentHourReadings = [];
        }
    }, 60000); // Check every minute
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
                return data.map((doc: any) => ({
                    id: doc._id.toString(),
                    hour: doc.hour instanceof Date ? doc.hour.toISOString() : String(doc.hour),
                    lightLevel: doc.lightLevel,
                    minLight: doc.minLight,
                    maxLight: doc.maxLight,
                    avgLight: doc.avgLight,
                    readingCount: doc.readingCount,
                }));
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
                return data.map((doc: any) => ({
                    id: doc._id.toString(),
                    hour: doc.hour instanceof Date ? doc.hour.toISOString() : String(doc.hour),
                    lightLevel: doc.lightLevel,
                    minLight: doc.minLight,
                    maxLight: doc.maxLight,
                    avgLight: doc.avgLight,
                    readingCount: doc.readingCount,
                }));
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
            }));
        },
    },

    Mutation: {
        addPlant: async (_: any, { name, type, plantedDate, count }: { name: string; type: PlantType; plantedDate: string; count: number }) => {
            const doc = await Plant.create({ name, type, plantedDate: new Date(plantedDate), count, monitored: true });
            await refreshPrimaryPlant();
            return { id: doc._id.toString(), name: doc.name, type: doc.type, plantedDate: doc.plantedDate.toISOString(), count: doc.count, monitored: doc.monitored };
        },
        updatePlant: async (_: any, { id, name, type, plantedDate, count }: { id: string; name: string; type: PlantType; plantedDate: string; count: number }) => {
            const doc = await Plant.findByIdAndUpdate(id, { name, type, plantedDate: new Date(plantedDate), count }, { new: true });
            if (!doc) throw new Error('Plant not found');
            await refreshPrimaryPlant();
            return { id: doc._id.toString(), name: doc.name, type: doc.type, plantedDate: doc.plantedDate.toISOString(), count: doc.count, monitored: doc.monitored };
        },
        setPlantMonitored: async (_: any, { id, monitored }: { id: string; monitored: boolean }) => {
            const doc = await Plant.findByIdAndUpdate(id, { monitored }, { new: true });
            if (!doc) throw new Error('Plant not found');
            await refreshPrimaryPlant();
            return { id: doc._id.toString(), name: doc.name, type: doc.type, plantedDate: doc.plantedDate.toISOString(), count: doc.count, monitored: doc.monitored };
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
