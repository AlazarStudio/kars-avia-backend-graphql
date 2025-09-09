import { mergeResolvers } from "@graphql-tools/merge"

import airlineResolver from "./airline/airline.resolver.js"
import airportResolver from "./airport/airport.resolver.js"
import analyticsResolver from "./analytics/analytics.resolver.js"
import chatResolver from "./chat/chat.resolver.js"
import cityResolver from "./city/city.resolver.js"
import contractResolver from "./contract/contract.resolver.js"
import dispatcherResolver from "./dispatcher/dispatcher.resolver.js"
import globalResolver from "./global/global.resolver.js"
import hotelResolver from "./hotel/hotel.resolver.js"
import logResolver from "./log/log.resolver.js"
import reportResolver from "./report/report.resolver.js"
import requestResolver from "./request/request.resolver.js"
import reserveResolver from "./reserve/reserve.resolver.js"
import userResolver from "./user/user.resolver.js"
import supportResolver from "./support/support.resolver.js"

const mergedResolvers = mergeResolvers([
  airlineResolver,
  airportResolver,
  analyticsResolver,
  chatResolver,
  cityResolver,
  contractResolver,
  dispatcherResolver,
  globalResolver,
  hotelResolver,
  logResolver,
  reportResolver,
  requestResolver,
  reserveResolver,
  userResolver,
  supportResolver
])

export default mergedResolvers
