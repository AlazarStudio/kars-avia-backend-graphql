import { GraphQLError } from "graphql"
import {
  buildExpiredNoProlongationWhere,
  appendArchiveFilter,
  archiveContractRecord,
  archiveContractRecordInternal,
  archiveAgreementRecord,
  archiveAgreementRecordInternal
} from "../services/contract/contractArchive.js"
import { getContractExpirationMeta } from "../services/contract/contractExpiration.js"

const assert = (condition, message) => {
  if (!condition) throw new Error(message)
}

const assertRejects = async (promise, message) => {
  try {
    await promise
    throw new Error(message)
  } catch (error) {
    if (error instanceof GraphQLError) return
    if (error.message === message) throw new Error(message)
    throw error
  }
}

const now = new Date("2025-06-25T12:00:00.000Z")
const futureEndDate = "2026-12-31T00:00:00.000Z"

const contractWhere = buildExpiredNoProlongationWhere(now, "contractEndDate")
assert(contractWhere.isProlongationEnabled === false, "prolongation must be false")
assert(contractWhere.contractEndDate.lt instanceof Date, "must compare end date")
assert(
  getContractExpirationMeta("2025-06-24T23:59:59.000Z", now).isExpired,
  "yesterday must be expired"
)
assert(
  !getContractExpirationMeta("2025-06-25T00:00:00.000Z", now).isExpired,
  "today must not be expired"
)

const agreementWhere = buildExpiredNoProlongationWhere(now, "agreementEndDate")
assert(agreementWhere.agreementEndDate !== undefined, "agreement field must be used")

const activeFilter = []
appendArchiveFilter({}, activeFilter)
assert(activeFilter[0].isArchived.not === true, "active list excludes archived")

const archivedFilter = []
appendArchiveFilter({ archived: true }, archivedFilter)
assert(archivedFilter[0].isArchived === true, "archived list includes archived only")

const createContractModelMock = (contract, updatedContract = { ...contract, isArchived: true }) => {
  let updateCalled = false
  return {
    model: {
      findUnique: async () => contract,
      update: async (args) => {
        updateCalled = true
        assert(args.data.isArchived === true, "update must set isArchived")
        return updatedContract
      }
    },
    wasUpdateCalled: () => updateCalled
  }
}

const createAgreementPrismaMock = (
  agreement,
  updatedAgreement = { ...agreement, isArchived: true }
) => {
  let updateCalled = false
  return {
    prisma: {
      additionalAgreement: {
        findUnique: async () => agreement,
        update: async (args) => {
          updateCalled = true
          assert(args.data.isArchived === true, "update must set isArchived")
          return updatedAgreement
        }
      }
    },
    wasUpdateCalled: () => updateCalled
  }
}

{
  const contract = {
    id: "contract-1",
    isArchived: false,
    contractEndDate: futureEndDate
  }
  const { model, wasUpdateCalled } = createContractModelMock(contract)
  const result = await archiveContractRecord({
    prismaModel: model,
    id: contract.id,
    userId: "user-1"
  })
  assert(result.isArchived === true, "manual archive must archive non-expired contract")
  assert(wasUpdateCalled(), "manual archive must call update for non-expired contract")
}

{
  const contract = {
    id: "contract-2",
    isArchived: true,
    contractEndDate: futureEndDate
  }
  const { model } = createContractModelMock(contract)
  await assertRejects(
    archiveContractRecord({
      prismaModel: model,
      id: contract.id,
      userId: "user-1"
    }),
    "manual archive must reject already archived contract"
  )
}

{
  const contract = {
    id: "contract-3",
    isArchived: false,
    contractEndDate: futureEndDate
  }
  const { model } = createContractModelMock(contract)
  const result = await archiveContractRecordInternal({
    prismaModel: model,
    id: contract.id,
    userId: null
  })
  assert(result === null, "internal archive must skip non-expired contract")
}

{
  const agreement = {
    id: "agreement-1",
    isArchived: false,
    agreementEndDate: futureEndDate
  }
  const { prisma, wasUpdateCalled } = createAgreementPrismaMock(agreement)
  const result = await archiveAgreementRecord({
    prisma,
    id: agreement.id,
    userId: "user-1"
  })
  assert(
    result.isArchived === true,
    "manual archive must archive non-expired additional agreement"
  )
  assert(
    wasUpdateCalled(),
    "manual archive must call update for non-expired additional agreement"
  )
}

{
  const agreement = {
    id: "agreement-2",
    isArchived: true,
    agreementEndDate: futureEndDate
  }
  const { prisma } = createAgreementPrismaMock(agreement)
  await assertRejects(
    archiveAgreementRecord({
      prisma,
      id: agreement.id,
      userId: "user-1"
    }),
    "manual archive must reject already archived additional agreement"
  )
}

{
  const agreement = {
    id: "agreement-3",
    isArchived: false,
    agreementEndDate: futureEndDate
  }
  const { prisma } = createAgreementPrismaMock(agreement)
  const result = await archiveAgreementRecordInternal({
    prisma,
    id: agreement.id,
    userId: null
  })
  assert(result === null, "internal archive must skip non-expired additional agreement")
}

console.log("contract archiving unit checks passed")
