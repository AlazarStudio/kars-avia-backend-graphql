// pubsub.js
import { PubSub } from 'graphql-subscriptions';

export const pubsub = new PubSub();
export const REQUEST_CREATED = 'REQUEST_CREATED';
export const REQUEST_UPDATED = 'REQUEST_UPDATED';
