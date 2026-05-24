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
    GRAPES
    MELON
    WATERMELON
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
    deviceId: String
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
    deviceId: String
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

  type Device {
    id: String!
    mac: String!
    name: String!
    lastSeenAt: String
    createdAt: String!
  }

  type UserSettings {
    tempMin: Float
    tempMax: Float
    digestTime: String
    digestEnabled: Boolean
    alertsEnabled: Boolean
    locale: String
  }

  type User {
    id: String!
    email: String!
    role: String!
    createdAt: String!
    deviceCount: Int!
    plantCount: Int!
  }

  type Query {
    sensorData: [SensorData!]!
    latestSensorData: SensorData
    hourlyData(limit: Int): [HourlySensorData!]!
    hourlyDataRange(from: String!, to: String!): [HourlySensorData!]!
    plants: [Plant!]!
    myDevices: [Device!]!
    myUserSettings: UserSettings!
    allUsers: [User!]!
  }

  type AuthPayload {
    token: String!
    email: String!
    role: String!
    userId: String!
  }

  type Mutation {
    login(email: String!, password: String!): AuthPayload!
    addPlant(name: String!, type: PlantType!, plantedDate: String!, count: Int!, dailyLightHours: Int): Plant!
    updatePlant(id: String!, name: String!, type: PlantType!, plantedDate: String!, count: Int!, dailyLightHours: Int): Plant!
    removePlant(id: String!): Boolean!
    setPlantMonitored(id: String!, monitored: Boolean!): Plant!
    openDeviceClaim: String!
    cancelDeviceClaim: Boolean!
    renameDevice(id: String!, name: String!): Device!
    removeDevice(id: String!): Boolean!
    updateUserSettings(
      tempMin: Float
      tempMax: Float
      digestTime: String
      digestEnabled: Boolean
      alertsEnabled: Boolean
      locale: String
    ): UserSettings!
  }

  type Subscription {
    sensorDataUpdated: SensorData!
    deviceClaimed(userId: String!): Device!
  }
`;
