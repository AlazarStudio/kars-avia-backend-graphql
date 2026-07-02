// src/resolvers/contracts.resolvers.js
import { prisma } from "../../prisma.js"
import {
  pubsub,
  CONTRACT_AIRLINE,
  CONTRACT_HOTEL,
  CONTRACT_ORGANIZATION
} from "../../services/infra/pubsub.js"
import { subscriptionAuthMiddleware } from "../../services/infra/subscriptionAuth.js"
import { withFilter } from "graphql-subscriptions"
import { allMiddleware } from "../../middlewares/authMiddleware.js"
import { uploadFiles, deleteFiles } from "../../services/files/uploadFiles.js"
import logAction from "../../services/infra/logaction.js"
import {
  buildAirlineContractWhere,
  buildHotelContractWhere,
  buildOrganizationContractWhere,
  fetchContractConnection,
  isArchivedContractFilter
} from "../../services/contract/contractFilters.js"
import {
  archiveContractRecord,
  restoreContractRecord,
  archiveAgreementRecord,
  restoreAgreementRecord,
  buildAdditionalAgreementWhere
} from "../../services/contract/contractArchive.js"
import { getContractExpirationMeta } from "../../services/contract/contractExpiration.js"

const contractExpirationFields = {
  daysUntilEnd: (parent) =>
    getContractExpirationMeta(parent.contractEndDate).daysUntilEnd,
  isExpiringSoon: (parent) =>
    getContractExpirationMeta(parent.contractEndDate).isExpiringSoon,
  isExpired: (parent) =>
    getContractExpirationMeta(parent.contractEndDate).isExpired,
  expirationPriority: (parent) =>
    getContractExpirationMeta(parent.contractEndDate).expirationPriority
}

const agreementExpirationFields = {
  daysUntilEnd: (parent) =>
    getContractExpirationMeta(parent.agreementEndDate).daysUntilEnd,
  isExpiringSoon: (parent) =>
    getContractExpirationMeta(parent.agreementEndDate).isExpiringSoon,
  isExpired: (parent) =>
    getContractExpirationMeta(parent.agreementEndDate).isExpired,
  expirationPriority: (parent) =>
    getContractExpirationMeta(parent.agreementEndDate).expirationPriority
}

const publishAgreementParentContract = async (agreement) => {
  if (!agreement) return

  if (agreement.airlineContractId) {
    const contract = await prisma.airlineContract.findUnique({
      where: { id: agreement.airlineContractId }
    })
    if (contract) {
      pubsub.publish(CONTRACT_AIRLINE, { contractAirline: contract })
    }
    return
  }

  if (agreement.hotelContractId) {
    const contract = await prisma.hotelContract.findUnique({
      where: { id: agreement.hotelContractId }
    })
    if (contract) {
      pubsub.publish(CONTRACT_HOTEL, { contractHotel: contract })
    }
    return
  }

  if (agreement.organizationContractId) {
    const contract = await prisma.organizationContract.findUnique({
      where: { id: agreement.organizationContractId }
    })
    if (contract) {
      pubsub.publish(CONTRACT_ORGANIZATION, { contractOrganization: contract })
    }
  }
}

const deleteContractAndAgreementFiles = async (contract) => {
  const filePaths = [
    ...(contract?.files || []),
    ...(contract?.additionalAgreements || []).flatMap(
      (agreement) => agreement.files || []
    )
  ]

  for (const filePath of filePaths) {
    await deleteFiles(filePath)
  }
}

const contractResolver = {
  Query: {
    // AIRLINE
    airlineContracts: async (_, { pagination, filter, orderBy }, context) => {
      await allMiddleware(context) // MIDDLEWARE_REVIEW: allMiddleware
      const where = buildAirlineContractWhere(filter)
      return fetchContractConnection({
        prismaModel: prisma.airlineContract,
        where,
        pagination,
        orderBy,
        isArchivedList: isArchivedContractFilter(filter),
        include: {
          company: true,
          airline: true,
          additionalAgreements: true
        }
      })
    },

    airlineContract: async (_, { id }, context) => {
      await allMiddleware(context) // MIDDLEWARE_REVIEW: allMiddleware
      return await prisma.airlineContract.findUnique({
        where: { id },
        include: {
          company: true,
          airline: true,
          additionalAgreements: true
        }
      })
    },

    // HOTEL
    hotelContracts: async (_, { pagination, filter, orderBy }, context) => {
      await allMiddleware(context) // MIDDLEWARE_REVIEW: allMiddleware
      const where = buildHotelContractWhere(filter)
      return fetchContractConnection({
        prismaModel: prisma.hotelContract,
        where,
        pagination,
        orderBy,
        isArchivedList: isArchivedContractFilter(filter),
        include: {
          company: true,
          hotel: true,
          region: true
        }
      })
    },

    hotelContract: async (_, { id }, context) => {
      await allMiddleware(context) // MIDDLEWARE_REVIEW: allMiddleware
      return await prisma.hotelContract.findUnique({
        where: { id },
        include: {
          company: true,
          hotel: true,
          region: true
        }
      })
    },

    // ORGANIZATION
    organizationContracts: async (
      _,
      { pagination, filter, orderBy },
      context
    ) => {
      await allMiddleware(context) // MIDDLEWARE_REVIEW: allMiddleware
      const where = buildOrganizationContractWhere(filter)
      return fetchContractConnection({
        prismaModel: prisma.organizationContract,
        where,
        pagination,
        orderBy,
        isArchivedList: isArchivedContractFilter(filter),
        include: {
          region: true,
          company: true,
          organization: true
        }
      })
    },

    organizationContract: async (_, { id }, context) => {
      await allMiddleware(context) // MIDDLEWARE_REVIEW: allMiddleware
      return await prisma.organizationContract.findUnique({
        where: { id },
        include: {
          region: true,
          company: true,
          organization: true
          // additionalAgreements: true
        }
      })
    },

    // ADDITIONAL AGREEMENTS
    additionalAgreements: async (_, { airlineContractId, filter }, context) => {
      await allMiddleware(context) // MIDDLEWARE_REVIEW: allMiddleware
      const resolvedFilter = {
        ...(filter || {}),
        ...(airlineContractId ? { airlineContractId } : {})
      }
      const where = buildAdditionalAgreementWhere(resolvedFilter)

      return await prisma.additionalAgreement.findMany({
        where,
        orderBy: { date: "desc" },
        include: {
          airlineContract: true,
          hotelContract: true,
          organizationContract: true
        }
      })
    }
  },

  Mutation: {
    // AIRLINE
    createAirlineContract: async (_, { input, files }, context) => {
      await allMiddleware(context)
      let filesPath = []
      if (files && files.length > 0) {
        for (const file of files) {
          const uploadedPath = await uploadFiles(file)
          filesPath.push(uploadedPath)
        }
      }

      const contract = await prisma.airlineContract.create({
        data: {
          companyId: input.companyId ?? null,
          airlineId: input.airlineId ?? null,
          date: input.date ?? null,
          contractEndDate: input.contractEndDate ?? null,
          isProlongationEnabled: input.isProlongationEnabled ?? false,
          contractNumber: input.contractNumber ?? null,
          region: input.region ?? null,
          applicationType: input.applicationType ?? null,
          notes: input.notes ?? null,
          files: filesPath
        },
        include: {
          company: true,
          airline: true,
          additionalAgreements: true
        }
      })
      pubsub.publish(CONTRACT_AIRLINE, { contractAirline: contract })

      await logAction({
        context,
        action: "create_airline_contract",
        description: "Договор авиакомпании создан",
        fulldescription:
          `Создан договор авиакомпании ${contract.contractNumber || ""}`.trim(),
        newData: {
          contractId: contract.id,
          contractNumber: contract.contractNumber,
          airlineId: contract.airlineId,
          companyId: contract.companyId
        }
      })

      return contract
    },

    updateAirlineContract: async (_, { id, input, files }, context) => {
      await allMiddleware(context)
      const oldContract = await prisma.airlineContract.findUnique({
        where: { id }
      })
      const updatedData = {}

      if (files && files.length > 0) {
        let filesPath = oldContract.files ? oldContract.files : []
        for (const file of files) {
          const uploadedPath = await uploadFiles(file)
          filesPath.push(uploadedPath)
        }
        updatedData.files = filesPath
      }

      if (input.companyId != undefined) {
        updatedData.companyId = input.companyId
      }
      if (input.airlineId != undefined) {
        updatedData.airlineId = input.airlineId
      }
      if (input.date != undefined) {
        updatedData.date = input.date
      }
      if (input.contractEndDate !== undefined) {
        updatedData.contractEndDate = input.contractEndDate
      }
      if (input.isProlongationEnabled !== undefined) {
        updatedData.isProlongationEnabled = input.isProlongationEnabled
      }
      if (input.contractNumber != undefined) {
        updatedData.contractNumber = input.contractNumber
      }
      if (input.region != undefined) {
        updatedData.region = input.region
      }
      if (input.applicationType != undefined) {
        updatedData.applicationType = input.applicationType
      }
      if (input.notes != undefined) {
        updatedData.notes = input.notes
      }

      const contract = await prisma.airlineContract.update({
        where: { id },
        data: updatedData,
        include: {
          company: true,
          airline: true,
          additionalAgreements: true
        }
      })
      pubsub.publish(CONTRACT_AIRLINE, { contractAirline: contract })

      await logAction({
        context,
        action: "update_airline_contract",
        description: "Договор авиакомпании обновлён",
        fulldescription:
          `Обновлён договор авиакомпании ${contract.contractNumber || ""}`.trim(),
        oldData: oldContract,
        newData: contract
      })

      return contract
    },

    deleteAirlineContract: async (_, { id }, context) => {
      await allMiddleware(context)
      const contract = await prisma.airlineContract.findUnique({
        where: { id },
        include: { additionalAgreements: true }
      })

      if (!contract) return true

      await deleteContractAndAgreementFiles(contract)

      await prisma.$transaction([
        prisma.additionalAgreement.deleteMany({
          where: { airlineContractId: id }
        }),
        prisma.airlineContract.delete({ where: { id } })
      ])

      pubsub.publish(CONTRACT_AIRLINE, { contractAirline: contract })
      return true
    },

    archiveAirlineContract: async (_, { id }, context) => {
      await allMiddleware(context)
      const userId = context.subject?.id ?? context.user?.id
      const contract = await archiveContractRecord({
        prismaModel: prisma.airlineContract,
        id,
        userId,
        include: {
          company: true,
          airline: true,
          additionalAgreements: true
        }
      })
      pubsub.publish(CONTRACT_AIRLINE, { contractAirline: contract })
      await logAction({
        context,
        action: "archive_airline_contract",
        description: "Договор авиакомпании архивирован",
        fulldescription:
          `Архивирован договор авиакомпании ${contract.contractNumber || ""}`.trim(),
        newData: contract
      })
      return contract
    },

    restoreAirlineContract: async (_, { id }, context) => {
      await allMiddleware(context)
      const contract = await restoreContractRecord({
        prismaModel: prisma.airlineContract,
        id,
        include: {
          company: true,
          airline: true,
          additionalAgreements: true
        }
      })
      pubsub.publish(CONTRACT_AIRLINE, { contractAirline: contract })
      await logAction({
        context,
        action: "restore_airline_contract",
        description: "Договор авиакомпании восстановлен из архива",
        fulldescription:
          `Восстановлен договор авиакомпании ${contract.contractNumber || ""}`.trim(),
        newData: contract
      })
      return contract
    },

    // HOTEL
    createHotelContract: async (_, { input, files }, context) => {
      await allMiddleware(context)
      let filesPath = []
      if (files && files.length > 0) {
        for (const file of files) {
          const uploadedPath = await uploadFiles(file)
          filesPath.push(uploadedPath)
        }
      }

      const contract = await prisma.hotelContract.create({
        data: {
          companyId: input.companyId ?? null,
          hotelId: input.hotelId ?? null,
          cityId: input.cityId, // обязательный
          date: input.date ?? null,
          contractEndDate: input.contractEndDate ?? null,
          isProlongationEnabled: input.isProlongationEnabled ?? false,
          contractNumber: input.contractNumber ?? null,
          notes: input.notes ?? null,
          legalEntity: input.legalEntity ?? null,
          signatureMark: input.signatureMark ?? null,
          completionMark: input.completionMark ?? null,
          normativeAct: input.normativeAct ?? null,
          applicationType: input.applicationType ?? null,
          executor: input.executor ?? null,
          files: filesPath
        },
        include: {
          company: true,
          hotel: true,
          region: true
        }
      })
      pubsub.publish(CONTRACT_HOTEL, { contractHotel: contract })

      await logAction({
        context,
        action: "create_hotel_contract",
        description: "Договор гостиницы создан",
        fulldescription:
          `Создан договор гостиницы ${contract.contractNumber || ""}`.trim(),
        newData: {
          contractId: contract.id,
          contractNumber: contract.contractNumber,
          hotelId: contract.hotelId,
          companyId: contract.companyId,
          cityId: contract.cityId
        }
      })

      return contract
    },

    updateHotelContract: async (_, { id, input, files }, context) => {
      await allMiddleware(context)
      const oldContract = await prisma.hotelContract.findUnique({
        where: { id }
      })
      const updatedData = {}

      if (files && files.length > 0) {
        let filesPath = oldContract.files ? oldContract.files : []
        for (const file of files) {
          const uploadedPath = await uploadFiles(file)
          filesPath.push(uploadedPath)
        }
        updatedData.files = filesPath
      }

      if (input.companyId != undefined) {
        updatedData.companyId = input.companyId
      }
      if (input.hotelId != undefined) {
        updatedData.hotelId = input.hotelId
      }
      if (input.cityId != undefined) {
        updatedData.cityId = input.cityId
      }
      if (input.date != undefined) {
        updatedData.date = input.date
      }
      if (input.contractEndDate !== undefined) {
        updatedData.contractEndDate = input.contractEndDate
      }
      if (input.isProlongationEnabled !== undefined) {
        updatedData.isProlongationEnabled = input.isProlongationEnabled
      }
      if (input.contractNumber != undefined) {
        updatedData.contractNumber = input.contractNumber
      }
      if (input.notes != undefined) {
        updatedData.notes = input.notes
      }
      if (input.legalEntity != undefined) {
        updatedData.legalEntity = input.legalEntity
      }
      if (input.signatureMark != undefined) {
        updatedData.signatureMark = input.signatureMark
      }
      if (input.completionMark != undefined) {
        updatedData.completionMark = input.completionMark
      }
      if (input.normativeAct != undefined) {
        updatedData.normativeAct = input.normativeAct
      }
      if (input.applicationType != undefined) {
        updatedData.applicationType = input.applicationType
      }
      if (input.executor != undefined) {
        updatedData.executor = input.executor
      }

      const contract = await prisma.hotelContract.update({
        where: { id },
        data: updatedData,
        include: {
          company: true,
          hotel: true,
          region: true
        }
      })
      pubsub.publish(CONTRACT_HOTEL, { contractHotel: contract })

      await logAction({
        context,
        action: "update_hotel_contract",
        description: "Договор гостиницы обновлён",
        fulldescription:
          `Обновлён договор гостиницы ${contract.contractNumber || ""}`.trim(),
        oldData: oldContract,
        newData: contract
      })

      return contract
    },

    deleteHotelContract: async (_, { id }, context) => {
      await allMiddleware(context)
      const contract = await prisma.hotelContract.findUnique({
        where: { id },
        include: { additionalAgreement: true }
      })

      if (!contract) return true

      const contractWithNormalizedRelations = {
        ...contract,
        additionalAgreements: contract.additionalAgreement || []
      }

      await deleteContractAndAgreementFiles(contractWithNormalizedRelations)

      await prisma.$transaction([
        prisma.additionalAgreement.deleteMany({
          where: { hotelContractId: id }
        }),
        prisma.hotelContract.delete({ where: { id } })
      ])

      pubsub.publish(CONTRACT_HOTEL, { contractHotel: contract })
      return true
    },

    archiveHotelContract: async (_, { id }, context) => {
      await allMiddleware(context)
      const userId = context.subject?.id ?? context.user?.id
      const contract = await archiveContractRecord({
        prismaModel: prisma.hotelContract,
        id,
        userId,
        include: {
          company: true,
          hotel: true,
          region: true
        }
      })
      pubsub.publish(CONTRACT_HOTEL, { contractHotel: contract })
      await logAction({
        context,
        action: "archive_hotel_contract",
        description: "Договор гостиницы архивирован",
        fulldescription:
          `Архивирован договор гостиницы ${contract.contractNumber || ""}`.trim(),
        newData: contract
      })
      return contract
    },

    restoreHotelContract: async (_, { id }, context) => {
      await allMiddleware(context)
      const contract = await restoreContractRecord({
        prismaModel: prisma.hotelContract,
        id,
        include: {
          company: true,
          hotel: true,
          region: true
        }
      })
      pubsub.publish(CONTRACT_HOTEL, { contractHotel: contract })
      await logAction({
        context,
        action: "restore_hotel_contract",
        description: "Договор гостиницы восстановлен из архива",
        fulldescription:
          `Восстановлен договор гостиницы ${contract.contractNumber || ""}`.trim(),
        newData: contract
      })
      return contract
    },

    // ORGANIZATION
    createOrganizationContract: async (_, { input, files }, context) => {
      await allMiddleware(context)
      let filesPath = []

      if (files?.length) {
        for (const file of files) {
          filesPath.push(await uploadFiles(file))
        }
      }

      const contract = await prisma.organizationContract.create({
        data: {
          companyId: input.companyId ?? null,
          organizationId: input.organizationId ?? null,
          cityId: input.cityId,
          date: input.date ?? null,
          contractEndDate: input.contractEndDate ?? null,
          isProlongationEnabled: input.isProlongationEnabled ?? false,
          contractNumber: input.contractNumber ?? null,
          notes: input.notes ?? null,
          applicationType: input.applicationType ?? null,
          files: filesPath
        },
        include: {
          region: true,
          company: true,
          organization: true
          // additionalAgreements: true
        }
      })

      pubsub.publish(CONTRACT_ORGANIZATION, {
        contractOrganization: contract
      })

      await logAction({
        context,
        action: "create_organization_contract",
        description: "Договор организации создан",
        fulldescription:
          `Создан договор организации ${contract.contractNumber || ""}`.trim(),
        newData: {
          contractId: contract.id,
          contractNumber: contract.contractNumber,
          organizationId: contract.organizationId,
          companyId: contract.companyId,
          cityId: contract.cityId
        }
      })

      return contract
    },

    updateOrganizationContract: async (_, { id, input, files }, context) => {
      await allMiddleware(context)
      const oldContract = await prisma.organizationContract.findUnique({
        where: { id }
      })
      const updatedData = {}

      if (files?.length) {
        let filesPath = oldContract.files ? oldContract.files : []
        for (const file of files) {
          filesPath.push(await uploadFiles(file))
        }
        updatedData.files = filesPath
      }

      if (input.companyId !== undefined) updatedData.companyId = input.companyId
      if (input.organizationId !== undefined)
        updatedData.organizationId = input.organizationId
      if (input.cityId != undefined) {
        updatedData.cityId = input.cityId
      }
      if (input.date !== undefined) updatedData.date = input.date
      if (input.contractEndDate !== undefined)
        updatedData.contractEndDate = input.contractEndDate
      if (input.isProlongationEnabled !== undefined)
        updatedData.isProlongationEnabled = input.isProlongationEnabled
      if (input.contractNumber !== undefined)
        updatedData.contractNumber = input.contractNumber
      if (input.notes !== undefined) updatedData.notes = input.notes
      if (input.applicationType !== undefined)
        updatedData.applicationType = input.applicationType

      const contract = await prisma.organizationContract.update({
        where: { id },
        data: updatedData,
        include: {
          region: true,
          company: true,
          organization: true
          // additionalAgreements: true
        }
      })

      pubsub.publish(CONTRACT_ORGANIZATION, {
        contractOrganization: contract
      })

      await logAction({
        context,
        action: "update_organization_contract",
        description: "Договор организации обновлён",
        fulldescription:
          `Обновлён договор организации ${contract.contractNumber || ""}`.trim(),
        oldData: oldContract,
        newData: contract
      })

      return contract
    },

    deleteOrganizationContract: async (_, { id }, context) => {
      await allMiddleware(context)
      const contract = await prisma.organizationContract.findUnique({
        where: { id },
        include: { additionalAgreement: true }
      })

      if (!contract) return true

      const contractWithNormalizedRelations = {
        ...contract,
        additionalAgreements: contract.additionalAgreement || []
      }

      await deleteContractAndAgreementFiles(contractWithNormalizedRelations)

      await prisma.$transaction([
        prisma.additionalAgreement.deleteMany({
          where: { organizationContractId: id }
        }),
        prisma.organizationContract.delete({ where: { id } })
      ])

      pubsub.publish(CONTRACT_ORGANIZATION, {
        contractOrganization: contract
      })

      return true
    },

    archiveOrganizationContract: async (_, { id }, context) => {
      await allMiddleware(context)
      const userId = context.subject?.id ?? context.user?.id
      const contract = await archiveContractRecord({
        prismaModel: prisma.organizationContract,
        id,
        userId,
        include: {
          region: true,
          company: true,
          organization: true
        }
      })
      pubsub.publish(CONTRACT_ORGANIZATION, {
        contractOrganization: contract
      })
      await logAction({
        context,
        action: "archive_organization_contract",
        description: "Договор организации архивирован",
        fulldescription:
          `Архивирован договор организации ${contract.contractNumber || ""}`.trim(),
        newData: contract
      })
      return contract
    },

    restoreOrganizationContract: async (_, { id }, context) => {
      await allMiddleware(context)
      const contract = await restoreContractRecord({
        prismaModel: prisma.organizationContract,
        id,
        include: {
          region: true,
          company: true,
          organization: true
        }
      })
      pubsub.publish(CONTRACT_ORGANIZATION, {
        contractOrganization: contract
      })
      await logAction({
        context,
        action: "restore_organization_contract",
        description: "Договор организации восстановлен из архива",
        fulldescription:
          `Восстановлен договор организации ${contract.contractNumber || ""}`.trim(),
        newData: contract
      })
      return contract
    },

    // ADDITIONAL AGREEMENTS
    createAdditionalAgreement: async (_, { input, files }, context) => {
      await allMiddleware(context)

      let filesPath = []
      if (files && files.length > 0) {
        for (const file of files) {
          const uploadedPath = await uploadFiles(file)
          filesPath.push(uploadedPath)
        }
      }

      const contract = await prisma.additionalAgreement.create({
        data: {
          airlineContractId: input.airlineContractId
            ? input.airlineContractId
            : null,
          hotelContractId: input.hotelContractId ? input.hotelContractId : null,
          organizationContractId: input.organizationContractId
            ? input.organizationContractId
            : null,
          date: input.date ?? null,
          agreementEndDate: input.agreementEndDate ?? null,
          isProlongationEnabled: input.isProlongationEnabled ?? false,
          contractNumber: input.contractNumber ?? null,
          itemAgreement: input.itemAgreement ?? null,
          notes: input.notes ?? null,
          files: filesPath
        },
        include: {
          airlineContract: true,
          hotelContract: true,
          organizationContract: true
        }
      })

      if (input.airlineContractId != undefined) {
        pubsub.publish(CONTRACT_AIRLINE, { contractAirline: contract })
      }
      if (input.hotelContractId != undefined) {
        pubsub.publish(CONTRACT_HOTEL, { contractHotel: contract })
      }
      if (input.organizationContractId != undefined) {
        pubsub.publish(CONTRACT_ORGANIZATION, {
          contractOrganization: contract
        })
      }
      // pubsub.publish(CONTRACT_AIRLINE, { contractAirline: contract })

      await logAction({
        context,
        action: "create_additional_agreement",
        description: "Дополнительное соглашение создано",
        fulldescription:
          `Создано дополнительное соглашение ${contract.contractNumber || ""}`.trim(),
        newData: {
          additionalAgreementId: contract.id,
          contractNumber: contract.contractNumber,
          airlineContractId: contract.airlineContractId,
          hotelContractId: contract.hotelContractId,
          organizationContractId: contract.organizationContractId
        }
      })

      return contract
    },

    updateAdditionalAgreement: async (_, { id, input, files }, context) => {
      await allMiddleware(context)
      const oldAgreement = await prisma.additionalAgreement.findUnique({
        where: { id }
      })
      const updatedData = {}

      if (files && files.length > 0) {
        let filesPath = oldAgreement.files ? oldAgreement.files : []
        for (const file of files) {
          const uploadedPath = await uploadFiles(file)
          filesPath.push(uploadedPath)
        }
        updatedData.files = filesPath
      }

      if (input.airlineContractId != undefined) {
        updatedData.airlineContractId = input.airlineContractId
      }
      if (input.hotelContractId != undefined) {
        updatedData.hotelContractId = input.hotelContractId
      }
      if (input.organizationContractId != undefined) {
        updatedData.organizationContractId = input.organizationContractId
      }
      if (input.date != undefined) {
        updatedData.date = input.date
      }
      if (input.agreementEndDate !== undefined) {
        updatedData.agreementEndDate = input.agreementEndDate
      }
      if (input.isProlongationEnabled !== undefined) {
        updatedData.isProlongationEnabled = input.isProlongationEnabled
      }
      if (input.contractNumber != undefined) {
        updatedData.contractNumber = input.contractNumber
      }
      if (input.itemAgreement != undefined) {
        updatedData.itemAgreement = input.itemAgreement
      }
      if (input.notes != undefined) {
        updatedData.notes = input.notes
      }

      const contract = await prisma.additionalAgreement.update({
        where: { id },
        data: updatedData,
        include: { airlineContract: true, hotelContract: true }
      })

      if (input.airlineContractId != undefined) {
        pubsub.publish(CONTRACT_AIRLINE, { contractAirline: contract })
      }
      if (input.hotelContractId != undefined) {
        pubsub.publish(CONTRACT_HOTEL, { contractHotel: contract })
      }
      if (input.organizationContractId != undefined) {
        pubsub.publish(CONTRACT_ORGANIZATION, {
          contractOrganization: contract
        })
      }
      // pubsub.publish(CONTRACT_AIRLINE, { contractAirline: contract })

      await logAction({
        context,
        action: "update_additional_agreement",
        description: "Дополнительное соглашение обновлено",
        fulldescription:
          `Обновлено дополнительное соглашение ${contract.contractNumber || ""}`.trim(),
        oldData: oldAgreement,
        newData: contract
      })

      return contract
    },

    deleteAdditionalAgreement: async (_, { id }, context) => {
      await allMiddleware(context)
      const contract = await prisma.additionalAgreement.findUnique({
        where: { id }
      })
      if (contract.files && contract.files.length > 0) {
        for (const filePath of contract.files) {
          await deleteFiles(filePath)
        }
      }
      await prisma.additionalAgreement.delete({ where: { id } })
      await publishAgreementParentContract(contract)
      return true
    },

    archiveAdditionalAgreement: async (_, { id }, context) => {
      await allMiddleware(context)
      const userId = context.subject?.id ?? context.user?.id
      const agreement = await archiveAgreementRecord({
        prisma,
        id,
        userId,
        include: {
          airlineContract: true,
          hotelContract: true,
          organizationContract: true
        }
      })
      await publishAgreementParentContract(agreement)
      await logAction({
        context,
        action: "archive_additional_agreement",
        description: "Дополнительное соглашение архивировано",
        fulldescription:
          `Архивировано дополнительное соглашение ${agreement.contractNumber || ""}`.trim(),
        newData: {
          additionalAgreementId: agreement.id,
          contractNumber: agreement.contractNumber
        }
      })
      return agreement
    },

    restoreAdditionalAgreement: async (_, { id }, context) => {
      await allMiddleware(context)
      const agreement = await restoreAgreementRecord({
        prisma,
        id,
        include: {
          airlineContract: true,
          hotelContract: true,
          organizationContract: true
        }
      })
      await publishAgreementParentContract(agreement)
      await logAction({
        context,
        action: "restore_additional_agreement",
        description: "Дополнительное соглашение восстановлено из архива",
        fulldescription:
          `Восстановлено дополнительное соглашение ${agreement.contractNumber || ""}`.trim(),
        newData: {
          additionalAgreementId: agreement.id,
          contractNumber: agreement.contractNumber
        }
      })
      return agreement
    }
  },

  Subscription: {
    contractAirline: {
      subscribe: withFilter(
        () => pubsub.asyncIterator([CONTRACT_AIRLINE]),
        async (payload, variables, context) => {
          if (
            !(await subscriptionAuthMiddleware(
              allMiddleware,
              context,
              "contract.Subscription"
            ))
          ) {
            return false
          }
          const { subject, subjectType } = context

          if (!subject || subjectType !== "USER") return false

          // SUPERADMIN и диспетчеры видят все
          if (subject.role === "SUPERADMIN" || subject.dispatcher === true) {
            return true
          }

          // Пользователи авиакомпаний видят только свои договоры
          const contract = payload.contractAirline
          if (subject.airlineId && contract.airlineId === subject.airlineId) {
            return true
          }

          return false
        }
      )
    },
    contractHotel: {
      subscribe: withFilter(
        () => pubsub.asyncIterator([CONTRACT_HOTEL]),
        async (payload, variables, context) => {
          if (
            !(await subscriptionAuthMiddleware(
              allMiddleware,
              context,
              "contract.Subscription"
            ))
          ) {
            return false
          }
          const { subject, subjectType } = context

          if (!subject || subjectType !== "USER") return false

          // SUPERADMIN и диспетчеры видят все
          if (subject.role === "SUPERADMIN" || subject.dispatcher === true) {
            return true
          }

          // Пользователи отелей видят только свои договоры
          const contract = payload.contractHotel
          if (subject.hotelId && contract.hotelId === subject.hotelId) {
            return true
          }

          return false
        }
      )
    },
    contractOrganization: {
      subscribe: withFilter(
        () => pubsub.asyncIterator([CONTRACT_ORGANIZATION]),
        async (payload, variables, context) => {
          if (
            !(await subscriptionAuthMiddleware(
              allMiddleware,
              context,
              "contract.Subscription"
            ))
          ) {
            return false
          }
          const { subject, subjectType } = context

          if (!subject || subjectType !== "USER") return false

          // Только SUPERADMIN и диспетчеры видят договоры организаций
          return subject.role === "SUPERADMIN" || subject.dispatcher === true
        }
      )
    }
  },

  /* ---------- Field Resolvers (если нужны) ----------
     Обычно Prisma include уже подтягивает реляции. Эти поля можно
     опустить, но оставляю примеры для явного маппинга. */
  AirlineContract: {
    ...contractExpirationFields,
    company: async (parent) => {
      if (parent.companyId) {
        return await prisma.company.findUnique({
          where: { id: parent.companyId }
        })
      }
    },
    airline: async (parent) => {
      if (parent.airlineId) {
        return await prisma.airline.findUnique({
          where: { id: parent.airlineId }
        })
      }
    },
    additionalAgreements: async (parent) => {
      return await prisma.additionalAgreement.findMany({
        where: {
          airlineContractId: parent.id,
          isArchived: { not: true }
        }
      })
    }
  },

  HotelContract: {
    ...contractExpirationFields,
    company: async (parent) => {
      if (parent.companyId) {
        return await prisma.company.findUnique({
          where: { id: parent.companyId }
        })
      }
    },
    hotel: async (parent) => {
      if (parent.hotelId) {
        return await prisma.hotel.findUnique({
          where: { id: parent.hotelId }
        })
      }
    },
    additionalAgreements: async (parent) => {
      return await prisma.additionalAgreement.findMany({
        where: {
          hotelContractId: parent.id,
          isArchived: { not: true }
        }
      })
    }
    // region: (parent, _, __) =>
    //   parent.region ?? prisma.city.findUnique({ where: { id: parent.cityId } })
  },

  OrganizationContract: {
    ...contractExpirationFields,
    company: async (parent) => {
      if (!parent.companyId) return null
      return prisma.company.findUnique({
        where: { id: parent.companyId }
      })
    },

    organization: async (parent) => {
      if (!parent.organizationId) return null
      return prisma.organization.findUnique({
        where: { id: parent.organizationId }
      })
    },

    additionalAgreements: async (parent) => {
      return prisma.additionalAgreement.findMany({
        where: {
          organizationContractId: parent.id,
          isArchived: { not: true }
        }
      })
    }
  },

  AdditionalAgreement: {
    ...agreementExpirationFields,
    airlineContract: async (parent) => {
      parent.airlineContract ??
        (parent.airlineContractId
          ? await prisma.airlineContract.findUnique({
              where: { id: parent.airlineContractId }
            })
          : null)
    },
    hotelContract: async (parent) => {
      parent.hotelContract ??
        (parent.hotelContractId
          ? await prisma.hotelContract.findUnique({
              where: { id: parent.hotelContractId }
            })
          : null)
    },
    organizationContract: async (parent) => {
      parent.organizationContract ??
        (parent.organizationContractId
          ? await prisma.organizationContract.findUnique({
              where: { id: parent.organizationContractId }
            })
          : null)
    }
  }
}

export default contractResolver
