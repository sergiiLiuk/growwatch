import { Injectable } from '@angular/core';
import { ApolloClient, InMemoryCache, gql } from '@apollo/client/core';
import { HttpLink } from 'apollo-angular/http';
import { split } from '@apollo/client/core';
import { getMainDefinition } from '@apollo/client/utilities';
import { GraphQLWsLink } from '@apollo/client/link/subscriptions';
import { createClient } from 'graphql-ws';
import { Observable } from 'rxjs';

export type LightStatus = 'TOO_LOW' | 'OPTIMAL' | 'TOO_HIGH';

export interface LightStatusInfo {
    status: LightStatus;
    message: string;
    icon: string;
    percentageOfOptimal: number;
}

export interface SensorData {
    id: string;
    lightLevel: number;
    timestamp: string;
    lightStatus: LightStatusInfo;
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
}

@Injectable({
    providedIn: 'root'
})
export class SensorService {
    private apolloClient: ApolloClient;

    constructor(private httpLink: HttpLink) {
        // Create WebSocket link
        const wsLink = new GraphQLWsLink(
            createClient({
                url: 'ws://localhost:4000/graphql',
                on: {
                    connected: () => console.log('WebSocket connected'),
                    error: (error) => console.error('WebSocket error:', error),
                    closed: () => console.log('WebSocket closed'),
                }
            })
        );

        // Create HTTP link
        const http = this.httpLink.create({
            uri: 'http://localhost:4000/graphql',
        });

        // Split links based on operation type
        const link = split(
            ({ query }) => {
                const definition = getMainDefinition(query);
                return (
                    definition.kind === 'OperationDefinition' &&
                    definition.operation === 'subscription'
                );
            },
            wsLink,
            http
        );

        this.apolloClient = new ApolloClient({
            link,
            cache: new InMemoryCache(),
        });
    }

    getSensorData(): Observable<SensorData[]> {
        const GET_SENSOR_DATA = gql`
      query GetSensorData {
        sensorData {
          id
          lightLevel
          timestamp
          lightStatus {
            status
            message
            icon
            percentageOfOptimal
          }
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

    subscribeToSensorData(): Observable<SensorData> {
        const SENSOR_DATA_SUBSCRIPTION = gql`
      subscription OnSensorDataUpdated {
        sensorDataUpdated {
          id
          lightLevel
          timestamp
          lightStatus {
            status
            message
            icon
            percentageOfOptimal
          }
        }
      }
    `;

        return new Observable(observer => {
            console.log('Setting up sensor data subscription...');
            const subscription = this.apolloClient.subscribe({
                query: SENSOR_DATA_SUBSCRIPTION,
            }).subscribe({
                next: (result: any) => {
                    console.log('Subscription received data:', result);
                    observer.next(result.data?.sensorDataUpdated);
                },
                error: (error: any) => {
                    console.error('Subscription error:', error);
                    observer.error(error);
                }
            });

            return () => {
                console.log('Unsubscribing from sensor data...');
                subscription.unsubscribe();
            };
        });
    }

    getLatestSensorData(): Observable<SensorData | null> {
        const GET_LATEST_SENSOR_DATA = gql`
      query GetLatestSensorData {
        latestSensorData {
          id
          lightLevel
          timestamp
          lightStatus {
            status
            message
            icon
            percentageOfOptimal
          }
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

    getHourlyData(limit: number = 168): Observable<HourlySensorData[]> {
        const GET_HOURLY_DATA = gql`
      query GetHourlyData($limit: Int) {
        hourlyData(limit: $limit) {
          id
          hour
          lightLevel
          minLight
          maxLight
          avgLight
          readingCount
          lightStatus {
            status
            message
            icon
            percentageOfOptimal
          }
        }
      }
    `;

        return new Observable(observer => {
            this.apolloClient.query<{ hourlyData: HourlySensorData[] }>({
                query: GET_HOURLY_DATA,
                variables: { limit },
            }).then((result: any) => {
                observer.next(result.data?.hourlyData || []);
                observer.complete();
            }).catch((error: any) => {
                observer.error(error);
            });
        });
    }
}