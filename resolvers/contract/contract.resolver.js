// src/resolvers/contracts.resolvers.js
import { prisma } from "../../prisma.js"
import { pubsub } from "../../exports/pubsub.js"
import {
  allMiddleware,
  superAdminMiddleware
} from "../../middlewares/authMiddleware.js"
import { uploadFiles, deleteFiles } from "../../exports/uploadFiles.js"

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
      const totalPages = take && !all ? Math.ceil(totalCount / take) : 1
      return { items, totalCount, totalPages }
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
      const totalPages = take && !all ? Math.ceil(totalCount / take) : 1
      return { items, totalCount, totalPages }
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
    createAirlineContract: async (_, { input, files }) => {
      let filesPath = []
      if (files && files.length > 0) {
        for (const file of files) {
          const uploadedPath = await uploadFiles(file)
          filesPath.push(uploadedPath)
        }
      }

      return prisma.airlineContract.create({
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

      if (companyId != undefined) {
        updatedData.companyId = input.companyId
      }
      if (airlineId != undefined) {
        updatedData.airlineId = input.airlineId
      }
      if (date != undefined) {
        updatedData.date = input.date
      }
      if (contractNumber != undefined) {
        updatedData.contractNumber = input.contractNumber
      }
      if (region != undefined) {
        updatedData.region = input.region
      }
      if (applicationType != undefined) {
        updatedData.applicationType = input.applicationType
      }
      if (notes != undefined) {
        updatedData.notes = input.notes
      }

      return prisma.airlineContract.update({
        where: { id },
        data: updatedData,
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
    createAdditionalAgreement: async (_, { input, files }) => {
      if (!input.airlineContractId) {
        throw new Error("airlineContractId обязателен для AdditionalAgreement")
      }

      let filesPath = []
      if (files && files.length > 0) {
        for (const file of files) {
          const uploadedPath = await uploadFiles(file)
          filesPath.push(uploadedPath)
        }
      }

      return prisma.additionalAgreement.create({
        data: {
          airlineContractId: input.airlineContractId,
          date: input.date ?? null,
          contractNumber: input.contractNumber ?? null,
          itemAgreement: input.itemAgreement ?? null,
          notes: input.notes ?? null,
          files: filesPath
        },
        include: { airlineContract: true }
      })
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

      if (airlineContractId != undefined) {
        updatedData.airlineContractId = input.airlineContractId
      }
      if (date != undefined) {
        updatedData.date = input.date
      }
      if (contractNumber != undefined) {
        updatedData.contractNumber = input.contractNumber
      }
      if (itemAgreement != undefined) {
        updatedData.itemAgreement = input.itemAgreement
      }
      if (notes != undefined) {
        updatedData.notes = input.notes
      }

      return prisma.additionalAgreement.update({
        where: { id },
        data: updatedData,
        include: { airlineContract: true }
      })
    },

    deleteAdditionalAgreement: async (_, { id }) => {
      await prisma.additionalAgreement.delete({ where: { id } })
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
          files: filesPath
        },
        include: {
          company: true,
          hotel: true,
          region: true
        }
      })
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

      if (companyId != undefined) {
        updatedData.companyId = input.companyId
      }
      if (hotelId != undefined) {
        updatedData.hotelId = input.hotelId
      }
      if (cityId != undefined) {
        updatedData.cityId = input.cityId
      }
      if (date != undefined) {
        updatedData.date = input.date
      }
      if (contractNumber != undefined) {
        updatedData.contractNumber = input.contractNumber
      }
      if (notes != undefined) {
        updatedData.notes = input.notes
      }
      if (legalEntity != undefined) {
        updatedData.legalEntity = input.legalEntity
      }
      if (signatureMark != undefined) {
        updatedData.signatureMark = input.signatureMark
      }
      if (completionMark != undefined) {
        updatedData.completionMark = input.completionMark
      }
      if (normativeAct != undefined) {
        updatedData.normativeAct = input.normativeAct
      }
      if (applicationType != undefined) {
        updatedData.applicationType = input.applicationType
      }
      if (executor != undefined) {
        updatedData.executor = input.executor
      }

      return prisma.hotelContract.update({
        where: { id },
        data: updatedData,
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
