import { v4 as uuidv4 } from 'uuid';
import { pubsub, SENSOR_DATA_CHANNEL } from './pubsub';
import { SensorData } from './types';

// In-memory storage for sensor data
const sensorDataStore: SensorData[] = [
    {
        id: '1',
        temperature: 22.5,
        humidity: 65.0,
        soilMoisture: 45.0,
        lightLevel: 300.0,
        timestamp: new Date(Date.now() - 300000), // 5 minutes ago
    },
    {
        id: '2',
        temperature: 23.1,
        humidity: 62.0,
        soilMoisture: 48.0,
        lightLevel: 280.0,
        timestamp: new Date(Date.now() - 240000), // 4 minutes ago
    },
    {
        id: '3',
        temperature: 21.8,
        humidity: 68.0,
        soilMoisture: 42.0,
        lightLevel: 320.0,
        timestamp: new Date(Date.now() - 180000), // 3 minutes ago
    },
];

export const resolvers = {
    Query: {
        sensorData: (): SensorData[] => {
            return sensorDataStore.slice(-100); // Return last 100 records
        },
        latestSensorData: (): SensorData | null => {
            return sensorDataStore.length > 0
                ? sensorDataStore[sensorDataStore.length - 1]
                : null;
        },
    },

    Subscription: {
        sensorDataUpdated: {
            subscribe: () => pubsub.asyncIterator([SENSOR_DATA_CHANNEL]),
        },
    },
};

// Function to handle incoming ESP32 data
export const handleSensorData = (data: {
    temperature: number;
    humidity: number;
    soilMoisture: number;
    lightLevel: number;
}): SensorData => {
    const sensorData: SensorData = {
        id: uuidv4(),
        ...data,
        timestamp: new Date(),
    };

    // Store in memory
    sensorDataStore.push(sensorData);

    // Publish to subscribers
    pubsub.publish(SENSOR_DATA_CHANNEL, {
        sensorDataUpdated: sensorData,
    });

    return sensorData;
};
