import { mergeResolvers } from "@graphql-tools/merge"

import userResolver from "./user/user.resolver.js"
import hotelResolver from "./hotel/hotel.resolver.js"
import airlineResolver from "./airline/airline.resolver.js"
import requestResolver from "./request/request.resolver.js"
import chatResolver from "./chat/chat.resolver.js"
import fileResolver from "./file/file.resolver.js"
import airportResolver from "./airport/airport.resolver.js"
import cityResolver from "./city/city.resolver.js"
import reserveResolver from "./reserve/reserve.resolver.js"
import reportResolver from "./report/report.resolver.js"

const mergedResolvers = mergeResolvers([
  airlineResolver,
  airportResolver,
  chatResolver,
  cityResolver,
  fileResolver,
  hotelResolver,
  reportResolver,
  requestResolver,
  reserveResolver,
  userResolver,
  
])

export default mergedResolvers
