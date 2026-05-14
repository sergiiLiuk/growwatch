export interface SensorData {
    id: string;
    lightLevel: number;
    timestamp: Date;
    temperature?: number;
    humidity?: number;
    co2?: number;
    pressure?: number;
}

export interface ESP32Message {
    lightLevel: number;
    temperature?: number;
    humidity?: number;
    co2?: number;
    pressure?: number;
}
