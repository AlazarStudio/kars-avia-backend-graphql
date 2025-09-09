// src/resolvers/contracts.resolvers.js
import { prisma } from "../../prisma.js"
import { pubsub } from "../../exports/pubsub.js"
import {
  allMiddleware,
  superAdminMiddleware
} from "../../middlewares/authMiddleware.js"

/* ---------- Helpers ---------- */
function buildAirlineContractWhere(filter) {
  if (!filter) return {}
  const { companyId, airlineId, dateFrom, dateTo, search } = filter

  const AND = []

  if (companyId) AND.push({ companyId })
  if (airlineId) AND.push({ airlineId })
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
        { notes: { contains: s, mode: "insensitive" } }
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
        { notes: { contains: s, mode: "insensitive" } }
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

      return { items, totalCount }
    },

    airlineContract: async (_, { id }) => {
      return prisma.airlineContract.findUnique({
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

      return { items, totalCount }
    },

    hotelContract: async (_, { id }) => {
      return prisma.hotelContract.findUnique({
        where: { id },
        include: {
          company: true,
          hotel: true,
          region: true
        }
      })
    },

    additionalAgreements: async (_, { airlineContractId }) => {
      return prisma.additionalAgreement.findMany({
        where: airlineContractId ? { airlineContractId } : undefined,
        orderBy: { date: "desc" },
        include: { airlineContract: true }
      })
    }
  },

  Mutation: {
    // AIRLINE
    createAirlineContract: async (_, { input }) => {
      return prisma.airlineContract.create({
        data: {
          companyId: input.companyId ?? null,
          airlineId: input.airlineId ?? null,
          date: input.date ?? null,
          contractNumber: input.contractNumber ?? null,
          region: input.region ?? null,
          applicationType: input.applicationType ?? null,
          notes: input.notes ?? null,
          files: input.files ?? []
        },
        include: {
          company: true,
          airline: true,
          additionalAgreements: true
        }
      })
    },

    updateAirlineContract: async (_, { id, input }) => {
      return prisma.airlineContract.update({
        where: { id },
        data: {
          companyId: input.companyId ?? undefined,
          airlineId: input.airlineId ?? undefined,
          date: input.date ?? undefined,
          contractNumber: input.contractNumber ?? undefined,
          region: input.region ?? undefined,
          applicationType: input.applicationType ?? undefined,
          notes: input.notes ?? undefined,
          files: input.files ?? undefined
        },
        include: {
          company: true,
          airline: true,
          additionalAgreements: true
        }
      })
    },

    deleteAirlineContract: async (_, { id }) => {
      await prisma.airlineContract.delete({ where: { id } })
      return true
    },

    // ADDITIONAL AGREEMENTS
    createAdditionalAgreement: async (_, { input }) => {
      if (!input.airlineContractId) {
        throw new Error("airlineContractId обязателен для AdditionalAgreement")
      }
      return prisma.additionalAgreement.create({
        data: {
          airlineContractId: input.airlineContractId,
          date: input.date ?? null,
          contractNumber: input.contractNumber ?? null,
          itemAgreement: input.itemAgreement ?? null,
          notes: input.notes ?? null,
          files: input.files ?? []
        },
        include: { airlineContract: true }
      })
    },

    updateAdditionalAgreement: async (_, { id, input }) => {
      return prisma.additionalAgreement.update({
        where: { id },
        data: {
          airlineContractId: input.airlineContractId ?? undefined,
          date: input.date ?? undefined,
          contractNumber: input.contractNumber ?? undefined,
          itemAgreement: input.itemAgreement ?? undefined,
          notes: input.notes ?? undefined,
          files: input.files ?? undefined
        },
        include: { airlineContract: true }
      })
    },

    deleteAdditionalAgreement: async (_, { id }) => {
      await prisma.additionalAgreement.delete({ where: { id } })
      return true
    },

    // HOTEL
    createHotelContract: async (_, { input }) => {
      return prisma.hotelContract.create({
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
          files: input.files ?? []
        },
        include: {
          company: true,
          hotel: true,
          region: true
        }
      })
    },

    updateHotelContract: async (_, { id, input }) => {
      return prisma.hotelContract.update({
        where: { id },
        data: {
          companyId: input.companyId ?? undefined,
          hotelId: input.hotelId ?? undefined,
          cityId: input.cityId ?? undefined,
          date: input.date ?? undefined,
          contractNumber: input.contractNumber ?? undefined,
          notes: input.notes ?? undefined,
          legalEntity: input.legalEntity ?? undefined,
          signatureMark: input.signatureMark ?? undefined,
          completionMark: input.completionMark ?? undefined,
          normativeAct: input.normativeAct ?? undefined,
          applicationType: input.applicationType ?? undefined,
          executor: input.executor ?? undefined,
          files: input.files ?? undefined
        },
        include: {
          company: true,
          hotel: true,
          region: true
        }
      })
    },

    deleteHotelContract: async (_, { id }) => {
      await prisma.hotelContract.delete({ where: { id } })
      return true
    }
  },

  /* ---------- Field Resolvers (если нужны) ----------
     Обычно Prisma include уже подтягивает реляции. Эти поля можно
     опустить, но оставляю примеры для явного маппинга. */
  AirlineContract: {
    company: (parent, _, __) =>
      parent.company ??
      prisma.company.findUnique({ where: { id: parent.companyId } }),
    airline: (parent, _, __) =>
      parent.airline ??
      prisma.airline.findUnique({ where: { id: parent.airlineId } }),
    additionalAgreements: (parent, _, __) =>
      parent.additionalAgreements ??
      prisma.additionalAgreement.findMany({
        where: { airlineContractId: parent.id }
      })
  },

  HotelContract: {
    company: (parent, _, __) =>
      parent.company ??
      prisma.company.findUnique({ where: { id: parent.companyId } }),
    hotel: (parent, _, __) =>
      parent.hotel ??
      prisma.hotel.findUnique({ where: { id: parent.hotelId } }),
    region: (parent, _, __) =>
      parent.region ?? prisma.city.findUnique({ where: { id: parent.cityId } })
  },

  AdditionalAgreement: {
    airlineContract: (parent) =>
      parent.airlineContract ??
      (parent.airlineContractId
        ? prisma.airlineContract.findUnique({
            where: { id: parent.airlineContractId }
          })
        : null)
  }
}


export default contractResolver