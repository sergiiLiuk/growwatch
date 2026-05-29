import { SensorData } from './types';

export type StoredReading = SensorData & { userId?: string };

let store: StoredReading[] = [];

export function pushReading(r: StoredReading): void {
    store.push(r);
    if (store.length > 100) store = store.slice(-100);
}

export function getAll(): StoredReading[] {
    return store;
}

export function getAllForUser(userId: string): StoredReading[] {
    return store.filter(d => d.userId === userId);
}

export function getLatestForUser(userId: string): StoredReading | null {
    for (let i = store.length - 1; i >= 0; i--) {
        if (store[i].userId === userId) return store[i];
    }
    return null;
}
