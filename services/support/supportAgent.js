import { GraphQLError } from "graphql"
import { prisma } from "../../prisma.js"

export const getAuthUser = (context) => {
  if (context?.user) return context.user
  if (context?.subjectType === "USER" && context?.subject)
    return context.subject
  return null
}

export const isSupportAgent = (user) => user?.dispatcher === true

export const isSupportAgentFromContext = (context) =>
  isSupportAgent(getAuthUser(context))

export const assertSupportAgent = (context) => {
  if (!isSupportAgentFromContext(context)) {
    throw new GraphQLError("Доступ только для диспетчеров")
  }
}

export const assertCanOpenSupportChat = (context) => {
  if (isSupportAgentFromContext(context)) {
    throw new GraphQLError("Диспетчер не может создавать чат с поддержкой")
  }
}

export const findSupportAgents = () =>
  prisma.user.findMany({
    where: { dispatcher: true, active: true }
  })
