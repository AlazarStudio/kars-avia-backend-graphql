// pubsub.js
import { PubSub } from "graphql-subscriptions"

export const pubsub = new PubSub()
export const MESSAGE_SENT = "MESSAGE_SENT"
export const REQUEST_CREATED = "REQUEST_CREATED"
export const REQUEST_UPDATED = "REQUEST_UPDATED"
export const RESERVE_CREATED = "RESERVE_CREATED"
export const RESERVE_UPDATED = "RESERVE_UPDATED"
export const RESERVE_HOTEL = "RESERVE_HOTEL"
export const RESERVE_PASSENGERS = "RESERVE_PASSENGERS"
export const RESERVE_PERSONS = "RESERVE_PERSONS"
