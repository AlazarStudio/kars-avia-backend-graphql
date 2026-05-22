import { GraphQLError } from "graphql"
import { prisma } from "../../prisma.js"

export const getAuthUser = (context) => {
  if (context?.user) return context.user
  if (context?.subjectType === "USER" && context?.subject)
    return context.subject
  return null
}

/** Агент support-чата: диспетчер, support или суперадмин */
export const isSupportAgent = (user) => {
  if (!user) return false
  if (user.role === "SUPERADMIN") return true
  if (user.dispatcher === true) return true
  if (user.support === true) return true
  return false
}

export const isSupportChatClient = (user) => !isSupportAgent(user)

export const isSupportAgentFromContext = (context) =>
  isSupportAgent(getAuthUser(context))

export const assertSupportAgent = (context) => {
  if (!isSupportAgentFromContext(context)) {
    throw new GraphQLError(
      "Доступ только для диспетчеров, агентов поддержки или суперадмина"
    )
  }
}

export const assertCanOpenSupportChat = (context) => {
  if (isSupportAgentFromContext(context)) {
    throw new GraphQLError(
      "Агент поддержки не может создавать чат с поддержкой"
    )
  }
}

export const findSupportAgents = () =>
  prisma.user.findMany({
    where: {
      active: true,
      OR: [
        { dispatcher: true },
        { support: true },
        { role: "SUPERADMIN" }
      ]
    }
  })
