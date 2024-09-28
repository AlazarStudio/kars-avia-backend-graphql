import { mergeResolvers } from "@graphql-tools/merge"

import userResolver from "./user/user.resolver.js"
import hotelResolver from "./hotel/hotel.resolver.js"
import airlineResolver from "./airline/airline.resolver.js"
import requestResolver from "./request/request.resolver.js"
import chatResolver from "./chat/chat.resolver.js"
import fileResolver from "./file/file.resolver.js"
import airportResolver from "./airport/airport.resolver.js"
import cityResolver from "./city/city.resolver.js"

const mergedResolvers = mergeResolvers([
  userResolver,
  hotelResolver,
  airlineResolver,
  requestResolver,
  chatResolver,
  fileResolver,
  airportResolver,
  cityResolver
])

export default mergedResolvers
