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

      const [localHotels, tlHotels] = await Promise.all([
        prisma.hotel
          .findMany({
            where: {
              active: true,
              show: true,
              information: { is: { city: { equals: trimmed, mode: "insensitive" } } }
            },
            select: {
              id: true,
              name: true,
              images: true,
              stars: true,
              access: true,
              information: true,
              rooms: { select: { id: true }, take: 1 }
            }
          })
          .catch((err) => {
            logger.warn(`hotelOptionsForPlacement local fetch failed: ${err?.message}`)
            return []
          }),
        travellineService.getHotelsByLocalCityName(trimmed)
      ])

      const localOptions = localHotels.map((h) => ({
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
      }))

      const tlOptions = (tlHotels ?? []).map((p) => ({
        source: "travelline",
        id: p.id,
        name: p.name,
        photo: Array.isArray(p.photos) && p.photos.length > 0 ? p.photos[0] : null,
        city: p.address?.city ?? null,
        address: p.address?.street ?? null,
        stars: p.stars ?? null,
        description: p.description ?? null,
        access: null,
        hasRooms: null
      }))

      return [...localOptions, ...tlOptions]
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
    }
  },

  Mutation: {
    tlSetConfig: async (_, { input }, context) => {
      await adminMiddleware(context)
      return travellineService.setConfig(input.clientId, input.clientSecret, input.baseUrl)
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
