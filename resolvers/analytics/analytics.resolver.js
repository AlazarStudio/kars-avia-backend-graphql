import { prisma } from "../../prisma.js"
import { GraphQLError } from "graphql"
import {
  allMiddleware,
  superAdminMiddleware
} from "../../middlewares/authMiddleware.js"

const analyticsResolver = {
  Query: {},
  Mutation: {},
  Analytics: {}
}



export default analyticsResolver
