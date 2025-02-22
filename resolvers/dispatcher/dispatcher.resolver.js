import { prisma } from "../../prisma.js"
import {
  pubsub,
  // AIRLINE_CREATED,
  // AIRLINE_UPDATED,
  // MESSAGE_SENT,
  // HOTEL_CREATED,
  // HOTEL_UPDATED,
  // REPORT_CREATED,
  // REQUEST_CREATED,
  // REQUEST_UPDATED,
  // RESERVE_CREATED,
  // RESERVE_HOTEL,
  // RESERVE_UPDATED,
  // RESERVE_PERSONS,
  // USER_CREATED,
  NOTIFICATION
} from "../../exports/pubsub.js"

const dispatcherResolver = {
  Subscription: {
    notification: {
      subscribe: () => pubsub.asyncIterator([NOTIFICATION])
    }
  }
}

export default dispatcherResolver
