// pubsub.js
import { PubSub } from "graphql-subscriptions"

export const pubsub = new PubSub()

export const AIRLINE_CREATED = "AIRLINE_CREATED"
export const AIRLINE_UPDATED = "AIRLINE_UPDATED"
export const MESSAGE_SENT = "MESSAGE_SENT"
export const HOTEL_CREATED = "HOTEL_CREATED"
export const HOTEL_UPDATED = "HOTEL_UPDATED"
export const REPORT_CREATED = "REPORT_CREATED"
export const REQUEST_CREATED = "REQUEST_CREATED"
export const REQUEST_UPDATED = "REQUEST_UPDATED"
export const RESERVE_CREATED = "RESERVE_CREATED"
export const RESERVE_HOTEL = "RESERVE_HOTEL"
export const RESERVE_UPDATED = "RESERVE_UPDATED"
export const RESERVE_PERSONS = "RESERVE_PERSONS"
export const USER_CREATED = "USER_CREATED"
export const USER_ONLINE = "USER_ONLINE"
export const NOTIFICATION = "NOTIFICATION"
