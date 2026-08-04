// Подписки ФАП.

import { withFilter } from "graphql-subscriptions"
import {
  pubsub,
  PASSENGER_REQUEST_CREATED,
  PASSENGER_REQUEST_UPDATED
} from "../../services/infra/pubsub.js"

export default {
  Subscription: {
    passengerRequestCreated: {
      subscribe: withFilter(
        () => pubsub.asyncIterator([PASSENGER_REQUEST_CREATED]),
        (payload, variables, context) => {
          // Фильтр пропускает всё осознанно: субъект проверяется выше, в
          // subscribe (withFapAuthGuard), а адресной рассылки по получателю
          // в ФАП нет — событие уходит всем подписчикам.
          return true
        }
      )
    },

    passengerRequestUpdated: {
      subscribe: withFilter(
        () => pubsub.asyncIterator([PASSENGER_REQUEST_UPDATED]),
        (payload, variables, context) => {
          // Фильтр пропускает всё осознанно: субъект проверяется выше, в
          // subscribe (withFapAuthGuard), а адресной рассылки по получателю
          // в ФАП нет — событие уходит всем подписчикам.
          return true
        }
      )
    }
  }
}
