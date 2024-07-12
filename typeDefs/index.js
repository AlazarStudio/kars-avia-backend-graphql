import { mergeTypeDefs } from "@graphql-tools/merge"

import userTypeDef from "./user/user.typeDef.js"
import hotelTypeDef from "./hotel/hotel.typeDef.js"
import airlineTypeDef from "./airline/airline.typeDef.js"
import requestTypeDef from "./request/request.typeDef.js"

const mergedTypeDefs = mergeTypeDefs([
  userTypeDef,
  hotelTypeDef,
  airlineTypeDef,
  requestTypeDef
])

export default mergedTypeDefs
