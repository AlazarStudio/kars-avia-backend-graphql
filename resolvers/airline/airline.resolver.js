import { prisma } from "../../prisma.js"

const airlineResolver = {
  Query: {
    airlines: async () => {
      return await prisma.airline.findMany({
        include: {
          staff: true
        }
      })
    },
    airline: async (_, { id }) => {
      return await prisma.airline.findUnique({
        where: { id },
        include: {
          staff: true
        }
      })
    }
  },
  Mutation: {
    createAirline: async (_, { input }) => {
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

      // Формируем объект данных для создания авиакомпании
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

      return await prisma.airline.create({
        data,
        include: {
          staff: true
        }
      })
    },
    updateAirline: async (_, { id, input }) => {
      // Формируем объект данных для обновления авиакомпании
      const data = {
        ...input // spread оператор для удобства
      }

      return await prisma.airline.update({
        where: { id },
        data,
        include: {
          staff: true
        }
      })
    },
    deleteAirline: async (_, { id }) => {
      return await prisma.airline.delete({
        where: { id },
        include: {
          staff: true
        }
      })
    }
  },
  Airline: {
    staff: async (parent) => {
      return await prisma.airlinePersonal.findMany({
        where: { airlineId: parent.id }
      })
    }
  }
}

export default airlineResolver
