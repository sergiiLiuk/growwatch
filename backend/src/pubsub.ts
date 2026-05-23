import { PubSub } from 'graphql-subscriptions';

export const pubsub = new PubSub();

export const SENSOR_DATA_CHANNEL = 'SENSOR_DATA_CHANNEL';
export const deviceClaimedChannel = (userId: string) => `DEVICE_CLAIMED_${userId}`;
