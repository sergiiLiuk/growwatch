export interface SensorData {
    id: string;
    // Optional — H&T sensors report temperature/humidity but no light.
    lightLevel?: number;
    timestamp: Date;
    temperature?: number;
    humidity?: number;
    co2?: number;
    pressure?: number;
    deviceId?: string;
}
