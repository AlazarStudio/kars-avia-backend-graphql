import { mergeTypeDefs } from "@graphql-tools/merge"

import userTypeDef from "./user/user.typeDef.js"
import hotelTypeDef from "./hotel/hotel.typeDef.js"
import airlineTypeDef from "./airline/airline.typeDef.js"
import requestTypeDef from "./request/request.typeDef.js"
import chatTypeDef from "./chat/chat.typeDef.js" 

const mergedTypeDefs = mergeTypeDefs([
  userTypeDef,
  hotelTypeDef,
  airlineTypeDef,
  requestTypeDef,
  chatTypeDef
])

export default mergedTypeDefs
