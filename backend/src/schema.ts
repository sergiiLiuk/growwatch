import { gql } from 'graphql-tag';

export const typeDefs = gql`
  enum LightStatusEnum {
    TOO_LOW
    OPTIMAL
    TOO_HIGH
  }

  enum PlantType {
    TOMATO
    PEPPER
    CUCUMBER
    ZUCCHINI
    EGGPLANT
    LETTUCE
    SPINACH
    KALE
    ARUGULA
    RADISH
    BASIL
    MINT
    PARSLEY
    CILANTRO
    CHIVE
    OREGANO
    THYME
    ROSEMARY
    STRAWBERRY
  }

  type LightStatusInfo {
    status: LightStatusEnum!
    message: String!
    icon: String!
    percentageOfOptimal: Int!
  }

  type SensorData {
    id: String!
    lightLevel: Float!
    timestamp: String!
    lightStatus: LightStatusInfo!
    temperature: Float
    humidity: Float
    pressure: Float
    co2: Float
  }

  type HourlySensorData {
    id: String!
    hour: String!
    lightLevel: Float!
    minLight: Float!
    maxLight: Float!
    avgLight: Float!
    readingCount: Int!
    lightStatus: LightStatusInfo!
    avgTemperature: Float
    minTemperature: Float
    maxTemperature: Float
    avgHumidity: Float
    minHumidity: Float
    maxHumidity: Float
    avgPressure: Float
    avgCo2: Float
  }

  type Plant {
    id: String!
    name: String!
    type: PlantType!
    plantedDate: String!
    count: Int!
    monitored: Boolean!
    dailyLightHours: Int!
  }

  type Query {
    sensorData: [SensorData!]!
    latestSensorData: SensorData
    hourlyData(limit: Int): [HourlySensorData!]!
    hourlyDataRange(from: String!, to: String!): [HourlySensorData!]!
    plants: [Plant!]!
  }

  type Mutation {
    addPlant(name: String!, type: PlantType!, plantedDate: String!, count: Int!, dailyLightHours: Int): Plant!
    updatePlant(id: String!, name: String!, type: PlantType!, plantedDate: String!, count: Int!, dailyLightHours: Int): Plant!
    removePlant(id: String!): Boolean!
    setPlantMonitored(id: String!, monitored: Boolean!): Plant!
  }

  type Subscription {
    sensorDataUpdated: SensorData!
  }
`;
