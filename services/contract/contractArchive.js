import { GraphQLError } from "graphql"
import { getContractExpirationMeta } from "./contractExpiration.js"

export const isArchivedContractFilter = (filter) => filter?.archived === true

export const appendArchiveFilter = (filter, AND) => {
  if (filter?.archived === true) {
    AND.push({ isArchived: true })
  } else {
    // Активный список: матчим false, null и документы без поля isArchived
    // (старые договоры, созданные до добавления поля)
    AND.push({ isArchived: { not: true } })
  }
}

export const archiveContractRecord = async ({
  prismaModel,
  id,
  userId,
  include
}) => {
  const contract = await prismaModel.findUnique({ where: { id } })
  if (!contract) {
    throw new GraphQLError("Contract not found", {
      extensions: { code: "NOT_FOUND" }
    })
  }
  if (contract.isArchived) {
    throw new GraphQLError("Contract is already archived", {
      extensions: { code: "BAD_REQUEST" }
    })
  }

  const { isExpired } = getContractExpirationMeta(contract.contractEndDate)
  if (!isExpired) {
    throw new GraphQLError("Only expired contracts can be archived", {
      extensions: { code: "BAD_REQUEST" }
    })
  }

  return prismaModel.update({
    where: { id },
    data: {
      isArchived: true,
      archivedAt: new Date(),
      archivedById: userId ?? null
    },
    include
  })
}

export const restoreContractRecord = async ({ prismaModel, id, include }) => {
  const contract = await prismaModel.findUnique({ where: { id } })
  if (!contract) {
    throw new GraphQLError("Contract not found", {
      extensions: { code: "NOT_FOUND" }
    })
  }
  if (!contract.isArchived) {
    throw new GraphQLError("Contract is not archived", {
      extensions: { code: "BAD_REQUEST" }
    })
  }

  return prismaModel.update({
    where: { id },
    data: {
      isArchived: false,
      archivedAt: null,
      archivedById: null
    },
    include
  })
}
