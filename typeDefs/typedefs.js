import { mergeTypeDefs } from "@graphql-tools/merge"

import airlineTypeDef from "./airline/airline.typeDef.js"
import airportTypeDef from "./airport/airport.typeDef.js"
// import analyticsTypeDef from "./analytics/analytics.typeDef.js"
import chatTypeDef from "./chat/chat.typeDef.js"
import cityTypeDef from "./city/city.typeDef.js"
import dispatcherTypeDef from "./dispatcher/dispatcher.typeDef.js"
import globalTypeDef from "./global/global.typeDef.js"
import hotelTypeDef from "./hotel/hotel.typeDef.js"
import logTypeDef from "./log/log.typeDef.js"
import reportTypeDef from "./report/report.typeDef.js"
import requestTypeDef from "./request/request.typeDef.js"
import reserveTypeDef from "./reserve/reserve.typeDef.js"
import userTypeDef from "./user/user.typeDef.js"
import supportTypeDef from "./support/support.typeDef.js"

const mergedTypeDefs = mergeTypeDefs([
  airlineTypeDef,
  airportTypeDef,
  // analyticsTypeDef,
  chatTypeDef,
  cityTypeDef,
  dispatcherTypeDef,
  globalTypeDef,
  hotelTypeDef,
  logTypeDef,
  reportTypeDef,
  requestTypeDef,
  reserveTypeDef,
  userTypeDef,
  supportTypeDef
])

export default mergedTypeDefs
