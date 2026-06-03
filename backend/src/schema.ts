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
    archived: Boolean!
    dailyLightHours: Int!
    code: String
  }

  enum PlantActionType {
    water
    fertilize
    prune
    harvest
    bloom
    note
  }

  type PlantAction {
    id: String!
    plantId: String!
    type: PlantActionType!
    note: String
    createdAt: String!
  }

  type SmartTip {
    id: String!
    plantId: String!
    text: String!
    source: String!
    cycle: String
    generatedAt: String!
  }

  type Device {
    id: String!
    mac: String!
    name: String!
    lastSeenAt: String
    createdAt: String!
  }

  type UserLocation {
    lat: Float!
    lng: Float!
    city: String
  }

  input UserLocationInput {
    lat: Float!
    lng: Float!
    city: String
  }

  type UserSettings {
    tempMin: Float
    tempMax: Float
    humidityMin: Float
    humidityMax: Float
    frostThreshold: Float
    heatThreshold: Float
    windThreshold: Float
    digestTime: String
    digestEnabled: Boolean
    alertsEnabled: Boolean
    locale: String
    smartTipsEnabled: Boolean
    morningTipTime: String
    eveningTipTime: String
    location: UserLocation
  }

  type DailyBriefing {
    id: String!
    cycle: String!
    overview: String!
    source: String!
    generatedAt: String!
  }

  enum ReminderActionType {
    water
    fertilize
  }

  type PlantReminder {
    id: String!
    plantId: String!
    actionType: ReminderActionType!
    intervalDays: Float!
    notifyTime: String
    nextDueAt: String!
    snoozedUntil: String
    enabled: Boolean!
  }

  input PushSubscriptionInput {
    endpoint: String!
    p256dh: String!
    auth: String!
  }

  type User {
    id: String!
    email: String!
    role: String!
    subscriptionTier: String!
    createdAt: String!
    deviceCount: Int!
    plantCount: Int!
  }

  type Query {
    sensorData: [SensorData!]!
    latestSensorData: SensorData
    hourlyData(limit: Int): [HourlySensorData!]!
    hourlyDataRange(from: String!, to: String!): [HourlySensorData!]!
    plants(includeArchived: Boolean): [Plant!]!
    plantActions(plantId: String!, limit: Int): [PlantAction!]!
    smartTip(plantId: String!): SmartTip
    dailyBriefing: DailyBriefing
    plantReminders(plantId: String): [PlantReminder!]!
    vapidPublicKey: String
    myDevices: [Device!]!
    myUserSettings: UserSettings!
    allUsers: [User!]!
    me: AuthPayload!
  }

  type AuthPayload {
    token: String!
    email: String!
    role: String!
    userId: String!
    subscriptionTier: String!
  }

  type Mutation {
    login(email: String!, password: String!): AuthPayload!
    register(email: String!, password: String!): AuthPayload!
    requestPasswordReset(email: String!): Boolean!
    resetPassword(token: String!, newPassword: String!): Boolean!
    addPlant(name: String!, type: PlantType!, plantedDate: String!, count: Int!, dailyLightHours: Int): Plant!
    updatePlant(id: String!, name: String!, type: PlantType!, plantedDate: String!, count: Int!, dailyLightHours: Int): Plant!
    removePlant(id: String!): Boolean!
    setPlantMonitored(id: String!, monitored: Boolean!): Plant!
    setPlantArchived(id: String!, archived: Boolean!): Plant!
    logPlantAction(plantId: String!, type: PlantActionType!, note: String): PlantAction!
    removePlantAction(id: String!): Boolean!
    regenerateBriefing: DailyBriefing
    setSubscriptionTier(userId: String!, tier: String!): User!
    adminCreateUser(email: String!, password: String!, role: String!, tier: String!): User!
    adminUpdateUser(userId: String!, email: String, role: String, tier: String): User!
    adminDeleteUser(userId: String!): Boolean!
    setPlantReminder(plantId: String!, actionType: ReminderActionType!, intervalDays: Float!, enabled: Boolean!, notifyTime: String): PlantReminder!
    removePlantReminder(id: String!): Boolean!
    snoozeReminder(id: String!, hours: Int): PlantReminder!
    subscribeToPush(subscription: PushSubscriptionInput!): Boolean!
    unsubscribeFromPush(endpoint: String!): Boolean!
    openDeviceClaim: String!
    cancelDeviceClaim: Boolean!
    renameDevice(id: String!, name: String!): Device!
    removeDevice(id: String!): Boolean!
    updateUserSettings(
      tempMin: Float
      tempMax: Float
      humidityMin: Float
      humidityMax: Float
      frostThreshold: Float
      heatThreshold: Float
      windThreshold: Float
      digestTime: String
      digestEnabled: Boolean
      alertsEnabled: Boolean
      locale: String
      smartTipsEnabled: Boolean
      morningTipTime: String
      eveningTipTime: String
      location: UserLocationInput
    ): UserSettings!
  }

  type Subscription {
    sensorDataUpdated: SensorData!
    deviceClaimed(userId: String!): Device!
  }
`;
