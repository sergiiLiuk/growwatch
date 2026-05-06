export interface SensorData {
    id: string;
    temperature: number;
    humidity: number;
    soilMoisture: number;
    lightLevel: number;
    timestamp: Date;
}

export interface ESP32Message {
    temperature: number;
    humidity: number;
    soilMoisture: number;
    lightLevel: number;
}
