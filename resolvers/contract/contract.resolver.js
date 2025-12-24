// src/resolvers/contracts.resolvers.js
import { prisma } from "../../prisma.js"
import {
  pubsub,
  CONTRACT_AIRLINE,
  CONTRACT_HOTEL,
  CONTRACT_ORGANIZATION
} from "../../services/infra/pubsub.js"
import { withFilter } from "graphql-subscriptions"
import {
  allMiddleware,
  superAdminMiddleware
} from "../../middlewares/authMiddleware.js"
import { uploadFiles, deleteFiles } from "../../services/files/uploadFiles.js"

/* ---------- Helpers ---------- */
function buildAirlineContractWhere(filter) {
  if (!filter) return {}
  const { companyId, airlineId, applicationType, dateFrom, dateTo, search } =
    filter

  const AND = []

  if (companyId) AND.push({ companyId })
  if (airlineId) AND.push({ airlineId })
  if (applicationType)
    AND.push({
      applicationType: { contains: applicationType.trim(), mode: "insensitive" }
    })
  if (dateFrom || dateTo) {
    AND.push({
      date: {
        gte: dateFrom ?? undefined,
        lte: dateTo ?? undefined
      }
    })
  }
  if (search && search.trim()) {
    const s = search.trim()
    AND.push({
      OR: [
        { contractNumber: { contains: s, mode: "insensitive" } },
        { region: { contains: s, mode: "insensitive" } },
        { applicationType: { contains: s, mode: "insensitive" } },
        { notes: { contains: s, mode: "insensitive" } },
        { airline: { name: { contains: s, mode: "insensitive" } } },
        { company: { name: { contains: s, mode: "insensitive" } } }
      ]
    })
  }

  return AND.length ? { AND } : {}
}

function buildHotelContractWhere(filter) {
  if (!filter) return {}
  const { companyId, hotelId, cityId, dateFrom, dateTo, search } = filter

  const AND = []
  if (companyId) AND.push({ companyId })
  if (hotelId) AND.push({ hotelId })
  if (cityId) AND.push({ cityId })

  if (dateFrom || dateTo) {
    AND.push({
      date: {
        gte: dateFrom ?? undefined,
        lte: dateTo ?? undefined
      }
    })
  }
  if (search && search.trim()) {
    const s = search.trim()
    AND.push({
      OR: [
        { contractNumber: { contains: s, mode: "insensitive" } },
        { legalEntity: { contains: s, mode: "insensitive" } },
        { applicationType: { contains: s, mode: "insensitive" } },
        { notes: { contains: s, mode: "insensitive" } },
        { hotel: { name: { contains: s, mode: "insensitive" } } },
        { company: { name: { contains: s, mode: "insensitive" } } }
      ]
    })
  }

  return AND.length ? { AND } : {}
}

function buildOrganizationContractWhere(filter) {
  if (!filter) return {}

  const { companyId, organizationId, cityId, dateFrom, dateTo, search } = filter
  const AND = []

  if (companyId) AND.push({ companyId })
  if (organizationId) AND.push({ organizationId })
     if (cityId) AND.push({ cityId })

  if (dateFrom || dateTo) {
    AND.push({
      date: {
        gte: dateFrom ?? undefined,
        lte: dateTo ?? undefined
      }
    })
  }

  if (search && search.trim()) {
    const s = search.trim()
    AND.push({
      OR: [
        { contractNumber: { contains: s, mode: "insensitive" } },
        { applicationType: { contains: s, mode: "insensitive" } },
        { notes: { contains: s, mode: "insensitive" } },
        { organization: { name: { contains: s, mode: "insensitive" } } },
        { company: { name: { contains: s, mode: "insensitive" } } }
      ]
    })
  }

  return AND.length ? { AND } : {}
}

function buildOrderBy(orderBy) {
  if (!orderBy) return undefined
  // пропускаем поля, которых может не быть в модели
  const allowed = ["date", "contractNumber", "createdAt"]
  const entries = Object.entries(orderBy).filter(([k]) => allowed.includes(k))
  if (!entries.length) return undefined
  return entries.map(([field, dir]) => ({ [field]: dir }))
}

/* ---------- Root Resolvers ---------- */
const contractResolver = {
  Query: {
    // AIRLINE
    airlineContracts: async (_, { pagination, filter, orderBy }) => {
      const where = buildAirlineContractWhere(filter)
      const totalCount = await prisma.airlineContract.count({ where })

      const { skip, take, all } = pagination || {}
      const items = await prisma.airlineContract.findMany({
        where,
        skip: all ? undefined : skip ?? 0,
        take: all ? undefined : take ?? 20,
        orderBy: buildOrderBy(orderBy) ?? [{ date: "desc" }],
        include: {
          company: true,
          airline: true,
          additionalAgreements: true
        }
      })
      const totalPages = take && !all ? Math.ceil(totalCount / take) : 1
      return { items, totalCount, totalPages }
    },

    airlineContract: async (_, { id }) => {
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
    hotelContracts: async (_, { pagination, filter, orderBy }) => {
      const where = buildHotelContractWhere(filter)
      const totalCount = await prisma.hotelContract.count({ where })

      const { skip, take, all } = pagination || {}
      const items = await prisma.hotelContract.findMany({
        where,
        skip: all ? undefined : skip ?? 0,
        take: all ? undefined : take ?? 20,
        orderBy: buildOrderBy(orderBy) ?? [{ date: "desc" }],
        include: {
          company: true,
          hotel: true,
          region: true // City
        }
      })
      const totalPages = take && !all ? Math.ceil(totalCount / take) : 1
      return { items, totalCount, totalPages }
    },

    hotelContract: async (_, { id }) => {
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
    organizationContracts: async (_, { pagination, filter, orderBy }) => {
      const where = buildOrganizationContractWhere(filter)
      const totalCount = await prisma.organizationContract.count({ where })

      const { skip, take, all } = pagination || {}

      const items = await prisma.organizationContract.findMany({
        where,
        skip: all ? undefined : skip ?? 0,
        take: all ? undefined : take ?? 20,
        orderBy: buildOrderBy(orderBy) ?? [{ date: "desc" }],
        include: {
          region: true,
          company: true,
          organization: true
          // additionalAgreements: true
        }
      })

      const totalPages = take && !all ? Math.ceil(totalCount / take) : 1
      return { items, totalCount, totalPages }
    },

    organizationContract: async (_, { id }) => {
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
    additionalAgreements: async (_, { airlineContractId }) => {
      return await prisma.additionalAgreement.findMany({
        where: airlineContractId ? { airlineContractId } : undefined,
        orderBy: { date: "desc" },
        include: { airlineContract: true }
      })
    }
  },

  Mutation: {
    // AIRLINE
    createAirlineContract: async (_, { input, files }) => {
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
      return contract
    },

    updateAirlineContract: async (_, { id, input, files }) => {
      const updatedData = {}

      if (files && files.length > 0) {
        let filesPath = []
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
      return contract
    },

    deleteAirlineContract: async (_, { id }) => {
      const contract = await prisma.airlineContract.findUnique({
        where: { id }
      })
      if (contract.files && contract.files.length > 0) {
        for (const filePath of contract.files) {
          await deleteFiles(filePath)
        }
      }
      await prisma.airlineContract.delete({ where: { id } })
      pubsub.publish(CONTRACT_AIRLINE, { contractAirline: contract })
      return true
    },

    // HOTEL
    createHotelContract: async (_, { input, files }) => {
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
      return contract
    },

    updateHotelContract: async (_, { id, input, files }) => {
      const updatedData = {}

      if (files && files.length > 0) {
        let filesPath = []
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
      return contract
    },

    deleteHotelContract: async (_, { id }) => {
      const contract = await prisma.hotelContract.findUnique({
        where: { id }
      })
      if (contract.files && contract.files.length > 0) {
        for (const filePath of contract.files) {
          await deleteFiles(filePath)
        }
      }
      await prisma.hotelContract.delete({ where: { id } })
      pubsub.publish(CONTRACT_HOTEL, { contractHotel: contract })
      return true
    },

    // ORGANIZATION
    createOrganizationContract: async (_, { input, files }) => {
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

      return contract
    },

    updateOrganizationContract: async (_, { id, input, files }) => {
      const updatedData = {}

      if (files?.length) {
        updatedData.files = []
        for (const file of files) {
          updatedData.files.push(await uploadFiles(file))
        }
      }

      if (input.companyId !== undefined) updatedData.companyId = input.companyId
      if (input.organizationId !== undefined)
        updatedData.organizationId = input.organizationId
      if (input.cityId != undefined) {
        updatedData.cityId = input.cityId
      }
      if (input.date !== undefined) updatedData.date = input.date
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

      return contract
    },

    deleteOrganizationContract: async (_, { id }) => {
      const contract = await prisma.organizationContract.findUnique({
        where: { id }
      })

      if (contract?.files?.length) {
        for (const filePath of contract.files) {
          await deleteFiles(filePath)
        }
      }

      await prisma.organizationContract.delete({ where: { id } })

      pubsub.publish(CONTRACT_ORGANIZATION, {
        contractOrganization: contract
      })

      return true
    },

    // ADDITIONAL AGREEMENTS
    createAdditionalAgreement: async (_, { input, files }) => {
      // add middleware

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
      return contract
    },

    updateAdditionalAgreement: async (_, { id, input, files }) => {
      const updatedData = {}

      if (files && files.length > 0) {
        let filesPath = []
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
      return contract
    },

    deleteAdditionalAgreement: async (_, { id }) => {
      const contract = await prisma.additionalAgreement.findUnique({
        where: { id }
      })
      if (contract.files && contract.files.length > 0) {
        for (const filePath of contract.files) {
          await deleteFiles(filePath)
        }
      }
      await prisma.additionalAgreement.delete({ where: { id } })
      pubsub.publish(CONTRACT_AIRLINE, { contractAirline: contract })
      return true
    }
  },

  Subscription: {
    contractAirline: {
      subscribe: withFilter(
        () => pubsub.asyncIterator([CONTRACT_AIRLINE]),
        (payload, variables, context) => {
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
        (payload, variables, context) => {
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
        (payload, variables, context) => {
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
        where: { airlineContractId: parent.id }
      })
    }
  },

  HotelContract: {
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
        where: { hotelContractId: parent.id }
      })
    }
    // region: (parent, _, __) =>
    //   parent.region ?? prisma.city.findUnique({ where: { id: parent.cityId } })
  },

  OrganizationContract: {
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
        where: { organizationContractId: parent.id }
      })
    }
  },

  AdditionalAgreement: {
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
