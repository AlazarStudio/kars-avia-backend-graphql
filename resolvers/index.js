import { mergeResolvers } from '@graphql-tools/merge'

import userResolver from './user/user.resolver.js'
import hotelResolver from './hotel/hotel.resolver.js'

const mergedResolvers = mergeResolvers([userResolver, hotelResolver])

export default mergedResolvers
