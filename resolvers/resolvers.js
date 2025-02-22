import { mergeResolvers } from "@graphql-tools/merge"

import airlineResolver from "./airline/airline.resolver.js"
import airportResolver from "./airport/airport.resolver.js"
import chatResolver from "./chat/chat.resolver.js"
import cityResolver from "./city/city.resolver.js"
import dispatcherResolver from "./dispatcher/dispatcher.resolver.js"
import fileResolver from "./file/file.resolver.js"
import hotelResolver from "./hotel/hotel.resolver.js"
import reportResolver from "./report/report.resolver.js"
import requestResolver from "./request/request.resolver.js"
import reserveResolver from "./reserve/reserve.resolver.js"
import userResolver from "./user/user.resolver.js"
import supportResolver from "./support/support.resolver.js"

const mergedResolvers = mergeResolvers([
  airlineResolver,
  airportResolver,
  chatResolver,
  cityResolver,
  dispatcherResolver,
  fileResolver,
  hotelResolver,
  reportResolver,
  requestResolver,
  reserveResolver,
  userResolver,
  supportResolver
])

export default mergedResolvers
