import { gql } from 'graphql-tag';

export const typeDefs = gql`
  type SensorData {
    id: String!
    temperature: Float!
    humidity: Float!
    soilMoisture: Float!
    lightLevel: Float!
    timestamp: String!
  }

  type Query {
    sensorData: [SensorData!]!
    latestSensorData: SensorData
  }

  type Subscription {
    sensorDataUpdated: SensorData!
  }
`;
