import { GraphQLError } from "graphql"
import {
  getContractExpirationMeta,
  startOfUtcDay
} from "./contractExpiration.js"

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

export const buildExpiredNoProlongationWhere = (
  now = new Date(),
  endDateField = "contractEndDate"
) => ({
  isArchived: { not: true },
  isProlongationEnabled: false,
  [endDateField]: {
    not: null,
    lt: startOfUtcDay(now)
  }
})

const applyArchiveData = (userId) => ({
  isArchived: true,
  archivedAt: new Date(),
  archivedById: userId ?? null
})

const applyRestoreData = () => ({
  isArchived: false,
  archivedAt: null,
  archivedById: null
})

export const archiveContractRecordInternal = async ({
  prismaModel,
  id,
  userId,
  include
}) => {
  const contract = await prismaModel.findUnique({ where: { id } })
  if (!contract || contract.isArchived) return null

  const { isExpired } = getContractExpirationMeta(contract.contractEndDate)
  if (!isExpired) return null

  return prismaModel.update({
    where: { id },
    data: applyArchiveData(userId),
    include
  })
}

export const restoreContractRecordInternal = async ({
  prismaModel,
  id,
  include
}) => {
  const contract = await prismaModel.findUnique({ where: { id } })
  if (!contract || !contract.isArchived) return null

  return prismaModel.update({
    where: { id },
    data: applyRestoreData(),
    include
  })
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

  return archiveContractRecordInternal({ prismaModel, id, userId, include })
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

  return restoreContractRecordInternal({ prismaModel, id, include })
}

export const archiveAgreementRecordInternal = async ({
  prisma,
  id,
  userId,
  include
}) => {
  const agreement = await prisma.additionalAgreement.findUnique({ where: { id } })
  if (!agreement || agreement.isArchived) return null

  const { isExpired } = getContractExpirationMeta(agreement.agreementEndDate)
  if (!isExpired) return null

  return prisma.additionalAgreement.update({
    where: { id },
    data: applyArchiveData(userId),
    include
  })
}

export const restoreAgreementRecordInternal = async ({
  prisma,
  id,
  include
}) => {
  const agreement = await prisma.additionalAgreement.findUnique({ where: { id } })
  if (!agreement || !agreement.isArchived) return null

  return prisma.additionalAgreement.update({
    where: { id },
    data: applyRestoreData(),
    include
  })
}

export const archiveAgreementRecord = async ({ prisma, id, userId, include }) => {
  const agreement = await prisma.additionalAgreement.findUnique({ where: { id } })
  if (!agreement) {
    throw new GraphQLError("Additional agreement not found", {
      extensions: { code: "NOT_FOUND" }
    })
  }
  if (agreement.isArchived) {
    throw new GraphQLError("Additional agreement is already archived", {
      extensions: { code: "BAD_REQUEST" }
    })
  }

  const { isExpired } = getContractExpirationMeta(agreement.agreementEndDate)
  if (!isExpired) {
    throw new GraphQLError("Only expired additional agreements can be archived", {
      extensions: { code: "BAD_REQUEST" }
    })
  }

  return archiveAgreementRecordInternal({ prisma, id, userId, include })
}

export const restoreAgreementRecord = async ({ prisma, id, include }) => {
  const agreement = await prisma.additionalAgreement.findUnique({ where: { id } })
  if (!agreement) {
    throw new GraphQLError("Additional agreement not found", {
      extensions: { code: "NOT_FOUND" }
    })
  }
  if (!agreement.isArchived) {
    throw new GraphQLError("Additional agreement is not archived", {
      extensions: { code: "BAD_REQUEST" }
    })
  }

  return restoreAgreementRecordInternal({ prisma, id, include })
}

export const buildAdditionalAgreementWhere = (filter) => {
  const {
    airlineContractId,
    hotelContractId,
    organizationContractId
  } = filter || {}

  const AND = []
  appendArchiveFilter(filter, AND)

  if (airlineContractId) AND.push({ airlineContractId })
  if (hotelContractId) AND.push({ hotelContractId })
  if (organizationContractId) AND.push({ organizationContractId })

  return AND.length ? { AND } : {}
}
