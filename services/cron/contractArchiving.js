import { prisma } from "../../prisma.js"
import { logger } from "../infra/logger.js"
import {
  buildExpiredNoProlongationWhere,
  archiveContractRecordInternal,
  archiveAgreementRecordInternal
} from "../contract/contractArchive.js"
import {
  CONTRACT_AIRLINE,
  CONTRACT_HOTEL,
  CONTRACT_ORGANIZATION,
  pubsub
} from "../infra/pubsub.js"

const CONTRACT_ARCHIVE_INTERVAL_MS = 6 * 60 * 60 * 1000

let intervalId = null

const publishContractUpdate = (contract, topic) => {
  if (!contract) return

  if (topic === CONTRACT_AIRLINE) {
    pubsub.publish(CONTRACT_AIRLINE, { contractAirline: contract })
  } else if (topic === CONTRACT_HOTEL) {
    pubsub.publish(CONTRACT_HOTEL, { contractHotel: contract })
  } else if (topic === CONTRACT_ORGANIZATION) {
    pubsub.publish(CONTRACT_ORGANIZATION, { contractOrganization: contract })
  }
}

const archiveExpiredContracts = async (now, prismaModel, topic) => {
  const candidates = await prismaModel.findMany({
    where: buildExpiredNoProlongationWhere(now, "contractEndDate"),
    select: { id: true }
  })

  let archivedCount = 0

  for (const { id } of candidates) {
    const contract = await archiveContractRecordInternal({
      prismaModel,
      id,
      userId: null
    })

    if (!contract) continue

    archivedCount += 1
    publishContractUpdate(contract, topic)
  }

  return archivedCount
}

const getAgreementParentTopic = (agreement) => {
  if (agreement.airlineContractId) return CONTRACT_AIRLINE
  if (agreement.hotelContractId) return CONTRACT_HOTEL
  if (agreement.organizationContractId) return CONTRACT_ORGANIZATION
  return null
}

const loadAgreementParentContract = async (agreement) => {
  if (agreement.airlineContractId) {
    return prisma.airlineContract.findUnique({
      where: { id: agreement.airlineContractId }
    })
  }
  if (agreement.hotelContractId) {
    return prisma.hotelContract.findUnique({
      where: { id: agreement.hotelContractId }
    })
  }
  if (agreement.organizationContractId) {
    return prisma.organizationContract.findUnique({
      where: { id: agreement.organizationContractId }
    })
  }
  return null
}

const archiveExpiredAgreements = async (now) => {
  const candidates = await prisma.additionalAgreement.findMany({
    where: buildExpiredNoProlongationWhere(now, "agreementEndDate"),
    select: {
      id: true,
      airlineContractId: true,
      hotelContractId: true,
      organizationContractId: true
    }
  })

  let archivedCount = 0

  for (const candidate of candidates) {
    const agreement = await archiveAgreementRecordInternal({
      prisma,
      id: candidate.id,
      userId: null
    })

    if (!agreement) continue

    archivedCount += 1

    const topic = getAgreementParentTopic(candidate)
    if (!topic) continue

    const parentContract = await loadAgreementParentContract(candidate)
    publishContractUpdate(parentContract, topic)
  }

  return archivedCount
}

export const checkAndArchiveExpiredContracts = async () => {
  const now = new Date()

  const [airlineCount, hotelCount, organizationCount, agreementCount] =
    await Promise.all([
      archiveExpiredContracts(now, prisma.airlineContract, CONTRACT_AIRLINE),
      archiveExpiredContracts(now, prisma.hotelContract, CONTRACT_HOTEL),
      archiveExpiredContracts(
        now,
        prisma.organizationContract,
        CONTRACT_ORGANIZATION
      ),
      archiveExpiredAgreements(now)
    ])

  const total =
    airlineCount + hotelCount + organizationCount + agreementCount

  if (total > 0) {
    logger.info(
      `[CRON] Archived ${airlineCount} airline, ${hotelCount} hotel, ${organizationCount} organization contracts and ${agreementCount} additional agreements`
    )
  }
}

export const startContractArchivingJob = () => {
  if (intervalId) return

  logger.info("[CRON] Contract archiving job started")

  void checkAndArchiveExpiredContracts().catch((e) => {
    logger.error("[CRON] checkAndArchiveExpiredContracts failed", e)
  })

  intervalId = setInterval(() => {
    void checkAndArchiveExpiredContracts().catch((e) => {
      logger.error("[CRON] checkAndArchiveExpiredContracts failed", e)
    })
  }, CONTRACT_ARCHIVE_INTERVAL_MS)
}

export const stopContractArchivingJob = () => {
  if (intervalId) {
    clearInterval(intervalId)
    intervalId = null
    logger.info("[CRON] Contract archiving job stopped")
  }
}
