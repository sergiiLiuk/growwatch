import { Injectable } from '@angular/core';
import { ApolloClient, InMemoryCache, gql } from '@apollo/client/core';
import { HttpLink } from 'apollo-angular/http';
import { Observable } from 'rxjs';

export interface SensorData {
    id: string;
    temperature: number;
    humidity: number;
    soilMoisture: number;
    lightLevel: number;
    timestamp: string;
}

@Injectable({
    providedIn: 'root'
})
export class SensorService {
    private apolloClient: ApolloClient;

    constructor(private httpLink: HttpLink) {
        this.apolloClient = new ApolloClient({
            link: this.httpLink.create({
                uri: 'http://localhost:4000/graphql',
            }),
            cache: new InMemoryCache(),
        });
    }

    getSensorData(): Observable<SensorData[]> {
        const GET_SENSOR_DATA = gql`
      query GetSensorData {
        sensorData {
          id
          temperature
          humidity
          soilMoisture
          lightLevel
          timestamp
        }
      }
    `;

        return new Observable(observer => {
            this.apolloClient.query<{ sensorData: SensorData[] }>({
                query: GET_SENSOR_DATA,
            }).then((result: any) => {
                observer.next(result.data?.sensorData || []);
                observer.complete();
            }).catch((error: any) => {
                observer.error(error);
            });
        });
    }

    getLatestSensorData(): Observable<SensorData | null> {
        const GET_LATEST_SENSOR_DATA = gql`
      query GetLatestSensorData {
        latestSensorData {
          id
          temperature
          humidity
          soilMoisture
          lightLevel
          timestamp
        }
      }
    `;

        return new Observable(observer => {
            this.apolloClient.query<{ latestSensorData: SensorData | null }>({
                query: GET_LATEST_SENSOR_DATA,
            }).then((result: any) => {
                observer.next(result.data?.latestSensorData || null);
                observer.complete();
            }).catch((error: any) => {
                observer.error(error);
            });
        });
    }
}