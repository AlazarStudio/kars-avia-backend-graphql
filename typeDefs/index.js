import { mergeTypeDefs } from '@graphql-tools/merge'

import userTypeDef from './user/user.typeDef.js'
import hotelTypeDef from './hotel/hotel.typeDef.js'

const mergedTypeDefs = mergeTypeDefs([userTypeDef, hotelTypeDef])

export default mergedTypeDefs
