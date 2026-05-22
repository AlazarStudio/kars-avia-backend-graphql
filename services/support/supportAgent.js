import { GraphQLError } from "graphql"
import { prisma } from "../../prisma.js"

export const isSupportAgent = (user) => user?.dispatcher === true

export const assertSupportAgent = (user) => {
  if (!isSupportAgent(user)) {
    throw new GraphQLError("Доступ только для диспетчеров")
  }
}

export const assertCanOpenSupportChat = (user) => {
  if (isSupportAgent(user)) {
    throw new GraphQLError("Диспетчер не может создавать чат с поддержкой")
  }
}

export const findSupportAgents = () =>
  prisma.user.findMany({
    where: { dispatcher: true, active: true }
  })
