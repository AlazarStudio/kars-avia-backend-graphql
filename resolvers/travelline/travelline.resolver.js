import { prisma } from "../../prisma.js"
import { travellineService } from "../../services/travelline/travellineService.js"
import { adminMiddleware, allMiddleware } from "../../middlewares/authMiddleware.js"
import { logger } from "../../services/infra/logger.js"

const travellineResolver = {
  Query: {
    tlConfig: async (_, __, context) => {
      await adminMiddleware(context)
      return travellineService.getConfig()
    },

    hotelOptionsForPlacement: async (_, { city }, context) => {
      await allMiddleware(context)
      if (!city || !city.trim()) return []

      const trimmed = city.trim()

      // Видимость как в запросе `hotels`: суперадмин/диспетчер видят и скрытые
      // (show=false) отели, остальные роли — только show=true. Без этого город
      // мог присутствовать в выпадающем списке, но не давать ни одной гостиницы.
      const { user } = context
      const isSuper = user.role === "SUPERADMIN" || user.dispatcher === true

      // Локальные отели — kars-avia (не external) и TL-двойники (external=true) — оба из БД
      const allHotels = await prisma.hotel
        .findMany({
          where: {
            active: true,
            information: { is: { city: { equals: trimmed, mode: "insensitive" } } },
            ...(isSuper
              ? {}
              : {
                  OR: [
                    { external: { not: true }, show: true },
                    { external: true }
                  ]
                })
          },
          select: {
            id: true,
            name: true,
            images: true,
            stars: true,
            access: true,
            information: true,
            external: true,
            externalSource: true,
            externalId: true,
            externalRaw: true,
            rooms: { select: { id: true }, take: 1 }
          }
        })
        .catch((err) => {
          logger.warn(`hotelOptionsForPlacement fetch failed: ${err?.message}`)
          return []
        })

      const options = allHotels.map((h) => {
        if (h.external && h.externalSource === "travelline") {
          let parsed = null
          try { parsed = h.externalRaw ? JSON.parse(h.externalRaw) : null } catch { parsed = null }
          return {
            source: "travelline",
            id: h.externalId || h.id,
            name: h.name,
            photo: Array.isArray(h.images) && h.images.length > 0 ? h.images[0] : null,
            city: h.information?.city ?? null,
            address: h.information?.address ?? null,
            stars: h.stars ?? null,
            description: parsed?.description ?? null,
            access: null,
            hasRooms: null
          }
        }
        return {
          source: "local",
          id: h.id,
          name: h.name,
          photo: Array.isArray(h.images) && h.images.length > 0 ? h.images[0] : null,
          city: h.information?.city ?? null,
          address: h.information?.address ?? null,
          stars: h.stars ?? null,
          description: null,
          access: !!h.access,
          hasRooms: (h.rooms?.length ?? 0) > 0
        }
      })

      return options
    },

    tlCities: async (_, { countryCode }, context) => {
      await adminMiddleware(context)
      return travellineService.getCities(countryCode ?? "RUS")
    },

    tlPropertiesByCity: async (_, { input }, context) => {
      await adminMiddleware(context)
      return travellineService.searchPropertiesByCity(input.cityId, input.count ?? 200)
    },

    tlSearchProperties: async (_, { filter }, context) => {
      await adminMiddleware(context)
      return travellineService.searchProperties(filter ?? {})
    },

    tlProperty: async (_, { id }, context) => {
      await adminMiddleware(context)
      return travellineService.getProperty(id)
    },

    tlRoomTypes: async (_, { propertyId }, context) => {
      await adminMiddleware(context)
      return travellineService.getRoomTypes(propertyId)
    },

    tlRatePlans: async (_, { propertyId }, context) => {
      await adminMiddleware(context)
      return travellineService.getRatePlans(propertyId)
    },

    tlAvailability: async (_, { input }, context) => {
      await adminMiddleware(context)
      return travellineService.searchAvailability(input)
    },

    tlPropertyCalendar: async (_, { input }, context) => {
      await adminMiddleware(context)
      return travellineService.getPropertyCalendar(input)
    },

    tlPropertiesAvailability: async (_, { input }, context) => {
      await adminMiddleware(context)
      return travellineService.searchPropertiesAvailability(input)
    },

    tlReservations: async (_, __, context) => {
      await adminMiddleware(context)
      return travellineService.listReservations()
    },

    tlReservation: async (_, { id }, context) => {
      await adminMiddleware(context)
      return travellineService.getReservation(id)
    },

    tlCancellationPenalty: async (_, { bookingId }, context) => {
      await adminMiddleware(context)
      return travellineService.calculateCancellationPenalty(bookingId)
    },

    tlSyncStatus: async (_, __, context) => {
      await adminMiddleware(context)
      return travellineService.getSyncStatus()
    },

    tlLocalProperties: async (_, { filter }, context) => {
      await allMiddleware(context)
      const where = { externalSource: "travelline" }
      if (filter?.city) {
        where.information = {
          is: { city: { equals: String(filter.city).trim(), mode: "insensitive" } }
        }
      }
      const hotels = await prisma.hotel.findMany({ where })
      const items = hotels.map((h) => {
        const raw = h.externalRaw
        let parsed = null
        try { parsed = raw ? JSON.parse(raw) : null } catch { parsed = null }
        return {
          id: h.externalId || h.id,
          name: h.name,
          description: parsed?.description ?? null,
          phone: parsed?.phone ?? parsed?.contactInfo?.phone ?? null,
          email: parsed?.email ?? parsed?.contactInfo?.email ?? null,
          address: {
            country: parsed?.address?.country ?? h.information?.country ?? null,
            city: parsed?.address?.city ?? h.information?.city ?? null,
            street: parsed?.address?.street ?? h.information?.address ?? null,
            zip: parsed?.address?.zip ?? null
          },
          latitude: parsed?.latitude ?? null,
          longitude: parsed?.longitude ?? null,
          photos: Array.isArray(h.images) ? h.images : [],
          stars: h.stars ?? null,
          raw: raw || JSON.stringify(parsed ?? {})
        }
      })
      return { items, total: items.length, page: 1, pageSize: items.length }
    }
  },

  Mutation: {
    tlSetConfig: async (_, { input }, context) => {
      await adminMiddleware(context)
      return travellineService.setConfig(input.clientId, input.clientSecret, input.baseUrl)
    },

    tlSyncCatalog: async (_, { countryCode }, context) => {
      await adminMiddleware(context)
      return travellineService.startCatalogSync(countryCode || "RUS")
    },

    tlSetAutoSyncHours: async (_, { hours }, context) => {
      await adminMiddleware(context)
      return travellineService.setAutoSyncHours(hours)
    },

    tlCreateReservation: async (_, { input }, context) => {
      await adminMiddleware(context)
      return travellineService.createReservation(input)
    },

    tlCancelReservation: async (_, { id }, context) => {
      await adminMiddleware(context)
      return travellineService.cancelReservation(id)
    },

    tlVerifyBooking: async (_, { input }, context) => {
      await adminMiddleware(context)
      return travellineService.verifyBooking(input)
    },

    tlRawRequest: async (_, { input }, context) => {
      await adminMiddleware(context)
      return travellineService.rawRequest(input)
    }
  }
}

export default travellineResolver
