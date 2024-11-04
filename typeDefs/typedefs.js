import { mergeTypeDefs } from "@graphql-tools/merge"

import userTypeDef from "./user/user.typeDef.js"
import hotelTypeDef from "./hotel/hotel.typeDef.js"
import airlineTypeDef from "./airline/airline.typeDef.js"
import requestTypeDef from "./request/request.typeDef.js"
import chatTypeDef from "./chat/chat.typeDef.js"
import fileTypeDef from "./file/file.typeDef.js"
import airportTypeDef from "./airport/airport.typeDef.js"
import cityTypeDef from "./city/city.typeDef.js"
import reserveTypeDef from "./reserve/reserve.typeDef.js"
import reportTypeDef from "./report/report.typeDef.js"

const mergedTypeDefs = mergeTypeDefs([
  userTypeDef,
  hotelTypeDef,
  airlineTypeDef,
  requestTypeDef,
  reserveTypeDef,
  chatTypeDef,
  fileTypeDef,
  airportTypeDef,
  cityTypeDef,
  reportTypeDef,
])

export default mergedTypeDefs
