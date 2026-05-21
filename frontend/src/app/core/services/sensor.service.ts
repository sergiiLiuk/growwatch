import { Injectable } from '@angular/core';
import { ApolloClient, gql } from '@apollo/client/core';
import { Observable, retry, timer } from 'rxjs';
import { GraphQLClientService } from './graphql-client.service';

export const PLANT_LIGHT_RANGES: Record<string, { min: number; max: number; label: string }> = {
  TOMATO:     { min: 20000, max: 50000, label: 'Tomato' },
  PEPPER:     { min: 22000, max: 45000, label: 'Pepper' },
  CUCUMBER:   { min: 21000, max: 40000, label: 'Cucumber' },
  ZUCCHINI:   { min: 20000, max: 40000, label: 'Zucchini' },
  EGGPLANT:   { min: 20000, max: 40000, label: 'Eggplant' },
  LETTUCE:    { min: 10000, max: 20000, label: 'Lettuce' },
  SPINACH:    { min: 10000, max: 20000, label: 'Spinach' },
  KALE:       { min: 10000, max: 25000, label: 'Kale' },
  ARUGULA:    { min:  8000, max: 15000, label: 'Arugula' },
  RADISH:     { min: 10000, max: 20000, label: 'Radish' },
  BASIL:      { min: 14000, max: 28000, label: 'Basil' },
  MINT:       { min: 10000, max: 20000, label: 'Mint' },
  PARSLEY:    { min: 10000, max: 20000, label: 'Parsley' },
  CILANTRO:   { min: 10000, max: 20000, label: 'Cilantro' },
  CHIVE:      { min: 10000, max: 20000, label: 'Chive' },
  OREGANO:    { min: 15000, max: 30000, label: 'Oregano' },
  THYME:      { min: 15000, max: 30000, label: 'Thyme' },
  ROSEMARY:   { min: 20000, max: 40000, label: 'Rosemary' },
  STRAWBERRY: { min: 15000, max: 30000, label: 'Strawberry' },
};

export type LightStatus = 'TOO_LOW' | 'OPTIMAL' | 'TOO_HIGH';

export interface LightStatusInfo {
  status: LightStatus;
  message: string;
  icon: string;
  percentageOfOptimal: number;
}

export interface SensorData {
  id: string;
  timestamp: string;
  lightLevel: number;
  lightStatus: LightStatusInfo;
  // Coming soon — optional until sensors are added
  temperature?: number;
  humidity?: number;
  co2?: number;
  pressure?: number;
}

export interface HourlySensorData {
  id: string;
  hour: string;
  lightLevel: number;
  minLight: number;
  maxLight: number;
  avgLight: number;
  readingCount: number;
  lightStatus: LightStatusInfo;
  // Coming soon — optional until sensors are added
  avgTemperature?: number;
  minTemperature?: number;
  maxTemperature?: number;
  avgHumidity?: number;
  minHumidity?: number;
  maxHumidity?: number;
  avgCo2?: number;
  avgPressure?: number;
}

export type GreenhouseMood = 'thriving' | 'good' | 'stressed' | 'critical' | 'waiting' | 'offline';

export interface MoodInfo {
  mood: GreenhouseMood;
  label: string;
  description: string;
}

@Injectable({ providedIn: 'root' })
export class SensorService {
  private apolloClient: ApolloClient;

  constructor(gqlClient: GraphQLClientService) {
    this.apolloClient = gqlClient.client;
  }

  getSensorData(): Observable<SensorData[]> {
    return new Observable(observer => {
      this.apolloClient
        .query<{ sensorData: SensorData[] }>({
          query: gql`
            query GetSensorData {
              sensorData {
                id lightLevel timestamp temperature humidity pressure co2
                lightStatus { status message icon percentageOfOptimal }
              }
            }
          `,
        })
        .then((result: { data?: { sensorData: SensorData[] } }) => {
          observer.next(result.data?.sensorData || []);
          observer.complete();
        })
        .catch((err: any) => observer.error(err));
    });
  }

  getLatestSensorData(): Observable<SensorData | null> {
    return new Observable(observer => {
      this.apolloClient
        .query<{ latestSensorData: SensorData | null }>({
          query: gql`
            query GetLatestSensorData {
              latestSensorData {
                id lightLevel timestamp temperature humidity pressure co2
                lightStatus { status message icon percentageOfOptimal }
              }
            }
          `,
          fetchPolicy: 'network-only',
        })
        .then((result: { data?: { latestSensorData: SensorData | null } }) => {
          observer.next(result.data?.latestSensorData || null);
          observer.complete();
        })
        .catch((err: any) => observer.error(err));
    });
  }

  subscribeToSensorData(): Observable<SensorData> {
    return new Observable<SensorData>(observer => {
      const sub = this.apolloClient
        .subscribe({
          query: gql`
            subscription OnSensorDataUpdated {
              sensorDataUpdated {
                id lightLevel timestamp temperature humidity pressure co2
                lightStatus { status message icon percentageOfOptimal }
              }
            }
          `,
        })
        .subscribe({
          next: (result: any) => observer.next(result.data?.sensorDataUpdated),
          error: (err: any) => observer.error(err),
        });
      return () => sub.unsubscribe();
    }).pipe(
      retry({ delay: () => timer(3000) })
    );
  }

  getHourlyData(limit = 168): Observable<HourlySensorData[]> {
    return new Observable(observer => {
      this.apolloClient
        .query<{ hourlyData: HourlySensorData[] }>({
          query: gql`
            query GetHourlyData($limit: Int) {
              hourlyData(limit: $limit) {
                id hour lightLevel minLight maxLight avgLight readingCount
                avgTemperature minTemperature maxTemperature
                avgHumidity minHumidity maxHumidity
                avgPressure avgCo2
                lightStatus { status message icon percentageOfOptimal }
              }
            }
          `,
          variables: { limit },
          fetchPolicy: 'network-only',
        })
        .then((result: { data?: { hourlyData: HourlySensorData[] } }) => {
          observer.next(result.data?.hourlyData || []);
          observer.complete();
        })
        .catch((err: any) => observer.error(err));
    });
  }

  getHourlyDataRange(from: Date, to: Date): Observable<HourlySensorData[]> {
    return new Observable(observer => {
      this.apolloClient
        .query<{ hourlyDataRange: HourlySensorData[] }>({
          query: gql`
            query GetHourlyDataRange($from: String!, $to: String!) {
              hourlyDataRange(from: $from, to: $to) {
                id hour lightLevel minLight maxLight avgLight readingCount
                avgTemperature minTemperature maxTemperature
                avgHumidity minHumidity maxHumidity
                avgPressure avgCo2
                lightStatus { status message icon percentageOfOptimal }
              }
            }
          `,
          variables: { from: from.toISOString(), to: to.toISOString() },
          fetchPolicy: 'network-only',
        })
        .then((result: { data?: { hourlyDataRange: HourlySensorData[] } }) => {
          observer.next(result.data?.hourlyDataRange || []);
          observer.complete();
        })
        .catch((err: any) => observer.error(err));
    });
  }

  getMood(data: SensorData | null): MoodInfo {
    if (!data) return { mood: 'waiting', label: 'Waiting for data', description: 'No live reading yet' };

    const status = data.lightStatus?.status;
    const humidityOk = data.humidity == null || (data.humidity >= 40 && data.humidity <= 80);
    const tempOk = data.temperature == null || (data.temperature >= 15 && data.temperature <= 30);

    if (status === 'OPTIMAL' && humidityOk && tempOk) {
      return { mood: 'thriving', label: 'Optimal', description: 'All conditions within range' };
    }
    if (status === 'TOO_LOW' || !humidityOk) {
      return { mood: 'stressed', label: 'Attention needed', description: 'One or more conditions are outside the optimal range' };
    }
    if (status === 'TOO_HIGH') {
      return { mood: 'good', label: 'Acceptable', description: 'Light is above optimal — monitor closely' };
    }
    return { mood: 'good', label: 'Acceptable', description: 'Conditions are within acceptable range' };
  }
}
