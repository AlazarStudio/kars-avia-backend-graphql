// Подписки ФАП.

import { withFilter } from "graphql-subscriptions"
import {
  pubsub,
  PASSENGER_REQUEST_CREATED,
  PASSENGER_REQUEST_UPDATED
} from "../../services/infra/pubsub.js"
import { evaluateRequestAccess } from "../../services/passengerRequest/fapScopeGuard.js"

// Скоуп проверяется на КАЖДОМ событии, а не при подписке: проверка в subscribe
// одноразовая, и уже открытый поток иначе продолжал бы получать чужие заявки
// после того, как право на них исчезло. До этой проверки фильтры возвращали
// true безусловно, и любой подписчик получал все заявки системы целиком.
const allow = (payload, context, field, operation) => {
  const request = payload?.[field]
  if (!request) return false
  return evaluateRequestAccess({ ...context, fapOperation: operation }, request).allowed
}

export default {
  Subscription: {
    passengerRequestCreated: {
      subscribe: withFilter(
        () => pubsub.asyncIterator([PASSENGER_REQUEST_CREATED]),
        (payload, variables, context) =>
          allow(
            payload,
            context,
            "passengerRequestCreated",
            "Subscription.passengerRequestCreated"
          )
      )
    },

    passengerRequestUpdated: {
      subscribe: withFilter(
        () => pubsub.asyncIterator([PASSENGER_REQUEST_UPDATED]),
        (payload, variables, context) =>
          allow(
            payload,
            context,
            "passengerRequestUpdated",
            "Subscription.passengerRequestUpdated"
          )
      )
    }
  }
}
