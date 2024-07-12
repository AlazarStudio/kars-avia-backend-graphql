import { mergeResolvers } from "@graphql-tools/merge"

import userResolver from "./user/user.resolver.js"
import hotelResolver from "./hotel/hotel.resolver.js"
import airlineResolver from "./airline/airline.resolver.js"
import requestResolver from "./request/request.resolver.js"

const mergedResolvers = mergeResolvers([
  userResolver,
  hotelResolver,
  airlineResolver,
  requestResolver
])

export default mergedResolvers
