import { prisma } from '../../prisma.js'

const requestResolver = {
  Mutation: {
    createRequest: async (_, { input }) => {
      const {
        fullName,
        position,
        gender,
        phoneNumber,
        airport,
        arrival,
        departure,
        roomCategory,
        mealPlan
      } = input

      // Создание заявки
      const newRequest = await prisma.request.create({
        data: {
          fullName,
          position,
          gender,
          phoneNumber,
          airport,
          arrival,
          departure,
          roomCategory,
          mealPlan
        }
      })

      return newRequest
    }
  }
}

export default requestResolver
