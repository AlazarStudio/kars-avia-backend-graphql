import { mergeTypeDefs } from "@graphql-tools/merge"

import userTypeDef from "./user/user.typeDef.js"
import hotelTypeDef from "./hotel/hotel.typeDef.js"
import airlineTypeDef from "./airline/airline.typeDef.js"

const mergedTypeDefs = mergeTypeDefs([
  userTypeDef,
  hotelTypeDef,
  airlineTypeDef
])

export default mergedTypeDefs
