import { GraphQLError } from "graphql"

const isPrismaError = (error) =>
  typeof error?.code === "string" && /^P\d{4}$/.test(error.code)

export const rethrowUnlessInternalError = (error, fallbackMessage) => {
  if (error instanceof GraphQLError) {
    throw error
  }

  if (error?.extensions?.code === "BAD_USER_INPUT") {
    throw error
  }

  if (error instanceof Error && error.message && !isPrismaError(error)) {
    throw error
  }

  throw new Error(fallbackMessage)
}
