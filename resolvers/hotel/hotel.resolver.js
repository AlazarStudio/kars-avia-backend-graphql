import { prisma } from "../../prisma.js"

const hotelResolver = {
  Query: {
    hotels: async () => {
      return await prisma.hotel.findMany({
        include: {
          staff: true,
          categories: true,
          rooms: true,
          tariffs: true
        }
      })
    },
    hotel: async (_, { id }) => {
      return await prisma.hotel.findUnique({
        where: { id },
        include: {
          staff: true,
          categories: true,
          rooms: true,
          tariffs: true
        }
      })
    }
  },
  Mutation: {
    createHotel: async (_, { input }) => {
      const {
        name,
        country,
        city,
        address,
        quote,
        index,
        email,
        number,
        inn,
        ogrn,
        rs,
        bank,
        bik
      } = input

      // Формируем объект данных для создания отеля
      const data = {
        name,
        country,
        city,
        address,
        quote,
        index: index || "", // Пустая строка, если Индекс не определён
        email: email || "", // Пустая строка, если Email не определён
        number: number || "", // Пустая строка, если Номер не определён
        inn: inn || "", // Пустая строка, если ИНН не определён
        ogrn: ogrn || "", // Пустая строка, если ОГРН не определён
        rs: rs || "", // Пустая строка, если Р/С не определён
        bank: bank || "", // Пустая строка, если Банк не определён
        bik: bik || "" // Пустая строка, если БИК не определён
      }

      return await prisma.hotel.create({
        data,
        include: {
          staff: true,
          categories: true,
          rooms: true,
          tariffs: true
        }
      })
    },
    updateHotel: async (_, { id, input }) => {
      const {
        name,
        country,
        city,
        address,
        quote,
        index,
        email,
        number,
        inn,
        ogrn,
        rs,
        bank,
        bik
      } = input

      // Формируем объект данных для обновления отеля
      const data = {
        name,
        country,
        city,
        address,
        quote,
        index,
        email,
        number,
        inn,
        ogrn,
        rs,
        bank,
        bik
      }

      return await prisma.hotel.update({
        where: { id },
        data,
        include: {
          staff: true,
          categories: true,
          rooms: true,
          tariffs: true
        }
      })
    },
    deleteHotel: async (_, { id }) => {
      return await prisma.hotel.delete({
        where: { id },
        include: {
          staff: true,
          categories: true,
          rooms: true,
          tariffs: true
        }
      })
    }
  },
  Hotel: {
    staff: async (parent) => {
      return await prisma.hotelPersonal.findMany({
        where: { hotelId: parent.id }
      })
    },
    categories: async (parent) => {
      return await prisma.hotelCategory.findMany({
        where: { hotelId: parent.id }
      })
    },
    rooms: async (parent) => {
      return await prisma.hotelRoom.findMany({
        where: { hotelId: parent.id }
      })
    },
    tariffs: async (parent) => {
      return await prisma.hotelTariff.findMany({
        where: { hotelId: parent.id }
      })
    }
  }
}

export default hotelResolver
