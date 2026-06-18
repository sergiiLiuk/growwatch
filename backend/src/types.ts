export interface SensorData {
    id: string;
    lightLevel: number;
    timestamp: Date;
    temperature?: number;
    humidity?: number;
    co2?: number;
    pressure?: number;
    deviceId?: string;
}
