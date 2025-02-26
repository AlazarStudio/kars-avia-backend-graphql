// Импорт необходимых модулей и утилит
import { prisma } from "../../prisma.js"
import GraphQLUpload from "graphql-upload/GraphQLUpload.mjs"
import { uploadImage } from "../../exports/uploadImage.js"
import logAction from "../../exports/logaction.js"
import {
  adminMiddleware,
  airlineAdminMiddleware
} from "../../middlewares/authMiddleware.js"
import {
  pubsub,
  AIRLINE_CREATED,
  AIRLINE_UPDATED
} from "../../exports/pubsub.js"

// Основной объект-резольвер для работы с авиакомпаниями
const airlineResolver = {
  // Подключение типа Upload для работы с загрузкой файлов через GraphQL
  Upload: GraphQLUpload,

  // Query-резольверы для получения данных
  Query: {
    // Получение списка авиакомпаний с возможностью пагинации
    airlines: async (_, { pagination }, context) => {
      // Извлекаем параметры пагинации: skip, take и флаг all
      const { skip, take, all } = pagination || {}
      // Получаем общее количество авиакомпаний
      const totalCount = await prisma.airline.count({})

      // Если запрошено получение всех записей, то выполняем запрос без пагинации,
      // иначе - с использованием skip и take
      const airlines = all
        ? await prisma.airline.findMany({
            include: {
              staff: true,
              department: true
            },
            orderBy: { name: "asc" }
          })
        : await prisma.airline.findMany({
            skip: skip ? skip * take : undefined,
            take: take || undefined,
            include: {
              staff: true,
              department: true
            },
            orderBy: { name: "asc" }
          })

      // Расчет общего количества страниц при наличии пагинации
      const totalPages = take && !all ? Math.ceil(totalCount / take) : 1

      // Возвращаем список авиакомпаний вместе с дополнительными данными
      return {
        airlines,
        totalCount,
        totalPages
      }
    },

    // Получение данных одной авиакомпании по id с дополнительной информацией
    airline: async (_, { id }, context) => {
      return await prisma.airline.findUnique({
        where: { id },
        include: {
          staff: true,
          department: true,
          logs: true
        }
      })
    },

    // Получение данных о конкретном сотруднике авиакомпании по его id
    airlineStaff: async (_, { id }, context) => {
      return await prisma.airlinePersonal.findUnique({
        where: { id },
        include: { hotelChess: true }
      })
    },

    // Получение списка сотрудников для заданной авиакомпании по airlineId
    airlineStaffs: async (_, { airlineId }, context) => {
      return await prisma.airlinePersonal.findMany({
        where: { airlineId },
        include: { hotelChess: true },
        orderBy: { name: "asc" }
      })
    }
  },

  // Mutation-резольверы для изменения данных
  Mutation: {
    // Создание новой авиакомпании
    createAirline: async (_, { input, images }, context) => {
      const { user } = context
      // Проверка прав администратора
      adminMiddleware(context)

      // Значения по умолчанию для mealPrice (цены на питание)
      const defaultMealPrice = {
        breakfast: 0,
        lunch: 0,
        dinner: 0
      }

      // Значения по умолчанию для различных категорий цен
      const defaultPrices = {
        priceOneCategory: 0,
        priceTwoCategory: 0,
        priceThreeCategory: 0,
        priceFourCategory: 0,
        priceFiveCategory: 0,
        priceSixCategory: 0,
        priceSevenCategory: 0,
        priceEightCategory: 0,
        priceNineCategory: 0,
        priceTenCategory: 0
      }

      // Загружаем изображения (если есть) и собираем пути к ним
      let imagePaths = []
      if (images && images.length > 0) {
        for (const image of images) {
          const uploadedPath = await uploadImage(image)
          imagePaths.push(uploadedPath)
        }
      }

      // Формируем объект данных для создания авиакомпании,
      // используя дефолтные значения при отсутствии их в input
      const data = {
        ...input,
        mealPrice: input.mealPrice || defaultMealPrice,
        prices: input.prices || defaultPrices,
        images: imagePaths
      }

      // Создаем новую авиакомпанию с включением данных о персонале и департаментах
      const createdAirline = await prisma.airline.create({
        data,
        include: {
          staff: true,
          department: true
        }
      })

      // Логирование действия создания авиакомпании
      await logAction({
        context,
        action: "create_airline",
        description: `Пользователь <span style='color:#545873'>${user.name}</span> добавил авиакомпанию  <span style='color:#545873'> ${createdAirline.name} </span> `,
        airlineName: createdAirline.name,
        airlineId: createdAirline.id
      })

      // Публикация события создания авиакомпании через PubSub
      pubsub.publish(AIRLINE_CREATED, { airlineCreated: createdAirline })
      return createdAirline
    },

    // Обновление информации об авиакомпании
    updateAirline: async (_, { id, input, images }, context) => {
      const { user } = context
      // Проверка прав администратора авиакомпании
      airlineAdminMiddleware(context)

      // Загружаем новые изображения (если предоставлены) и собираем пути к ним
      let imagePaths = []
      if (images && images.length > 0) {
        for (const image of images) {
          imagePaths.push(await uploadImage(image))
        }
      }
      // Извлекаем из input данные для обновления, отделяя департаменты и персонал
      const { department, staff, ...restInput } = input
      try {
        // Обновляем основную информацию об авиакомпании,
        // включая обновление поля mealPrice и изображений (если новые были загружены)
        const previousAirlineData = await prisma.airline.findUnique({
          where: { id },
          select: { prices: true, mealPrice: true } // Получаем текущее значение mealPrice
        })

        const updatedAirline = await prisma.airline.update({
          where: { id },
          data: {
            ...restInput,
            prices: {
              ...previousAirlineData.prices, // Оставляем старые цены
              ...input.prices // Обновляем только переданные поля
            },
            mealPrice: {
              ...previousAirlineData.mealPrice, // Оставляем старые значения
              ...input.mealPrice // Обновляем только переданные поля
            },
            ...(imagePaths.length > 0 && { images: { set: imagePaths } })
          }
        })

        // Обработка департаментов авиакомпании
        if (department) {
          for (const depart of department) {
            if (depart.id) {
              // Если департамент уже существует, обновляем его данные
              await prisma.airlineDepartment.update({
                where: { id: depart.id },
                data: {
                  name: depart.name,
                  users: {
                    connect: depart.userIds
                      ? depart.userIds.map((userId) => ({ id: userId }))
                      : []
                  }
                }
              })
              await logAction({
                context,
                action: "update_airline",
                description: `Пользователь  <span style='color:#545873'> ${user.name} </span>  изменил данные в департаменте  <span style='color:#545873'> ${depart.name} </span> `,
                airlineId: id
              })
            } else {
              // Если департамента не существует, создаем новый
              await prisma.airlineDepartment.create({
                data: {
                  airlineId: id,
                  name: depart.name,
                  users: {
                    connect: depart.userIds
                      ? depart.userIds.map((userId) => ({ id: userId }))
                      : []
                  }
                }
              })
              await logAction({
                context,
                action: "update_airline",
                description: `Пользователь  <span style='color:#545873'> ${user.name} </span>  добавил департамент  <span style='color:#545873'> ${depart.name} </span> `,
                airlineId: id
              })
            }
          }
        }

        // Обработка информации о персонале авиакомпании
        if (staff) {
          for (const person of staff) {
            if (person.id) {
              // Обновляем данные существующего сотрудника
              await prisma.airlinePersonal.update({
                where: { id: person.id },
                data: {
                  name: person.name,
                  departmentId: person.departmentId,
                  number: person.number,
                  position: person.position,
                  gender: person.gender
                }
              })
              await logAction({
                context,
                action: "update_airline",
                description: `Пользователь  <span style='color:#545873'> ${user.name} </span>  обновил данные пользователя  <span style='color:#545873'> ${person.name} </span> `,
                airlineId: id
              })
            } else {
              // Создаем нового сотрудника
              await prisma.airlinePersonal.create({
                data: {
                  airlineId: id,
                  name: person.name,
                  departmentId: person.departmentId,
                  number: person.number,
                  position: person.position,
                  gender: person.gender
                }
              })
              await logAction({
                context,
                action: "update_airline",
                description: `Пользователь  <span style='color:#545873'> ${user.name} </span>  добавил пользователя  <span style='color:#545873'> ${person.name} </span> `,
                airlineId: id
              })
            }
          }
        }

        // Получаем обновленную информацию об авиакомпании вместе с департаментами и персоналом
        const airlineWithRelations = await prisma.airline.findUnique({
          where: { id },
          include: {
            department: true,
            staff: true
          }
        })

        // Логирование общего обновления данных авиакомпании
        await logAction({
          context,
          action: "update_airline",
          description: `Пользователь <span style='color:#545873'>${user.name}</span> обновил данные авиакомпании <span style='color:#545873'>${airlineWithRelations.name}</span>`,
          airlineId: id
        })

        // Публикация события обновления авиакомпании через PubSub
        pubsub.publish(AIRLINE_UPDATED, {
          airlineUpdated: airlineWithRelations
        })

        return airlineWithRelations
      } catch (error) {
        console.error("Ошибка при обновлении авиакомпании:", error)
        throw new Error("Не удалось обновить авиакомпанию")
      }
    },

    // Удаление авиакомпании
    deleteAirline: async (_, { id }, context) => {
      // Проверка прав администратора авиакомпании
      airlineAdminMiddleware(context)
      // Удаляем авиакомпанию и возвращаем связанные с ней данные (например, персонал)
      const deletedAirline = await prisma.airline.delete({
        where: { id },
        include: {
          staff: true
        }
      })
      // Если у авиакомпании есть изображения, удаляем их (функция deleteImage предполагается определённой в другом месте)
      if (deletedAirline.images && deletedAirline.images.length > 0) {
        for (const imagePath of deletedAirline.images) {
          await deleteImage(imagePath)
        }
      }
      return deletedAirline
    },

    // Удаление департамента авиакомпании
    deleteAirlineDepartment: async (_, { id }, context) => {
      // Проверка прав администратора авиакомпании
      airlineAdminMiddleware(context)
      // Удаляем департамент и возвращаем связанные с ним данные (например, персонал)
      const department = await prisma.airlineDepartment.delete({
        where: { id },
        include: {
          staff: true
        }
      })
      // Получаем обновленную информацию об авиакомпании, к которой относится удалённый департамент
      const airlineWithRelations = await prisma.airline.findUnique({
        where: { id: department.airlineId }
      })
      // Публикация события обновления авиакомпании
      pubsub.publish(AIRLINE_UPDATED, {
        airlineUpdated: airlineWithRelations
      })
      return airlineWithRelations
    },

    // Удаление сотрудника авиакомпании
    deleteAirlineStaff: async (_, { id }, context) => {
      // Проверка прав администратора авиакомпании
      airlineAdminMiddleware(context)
      // Удаляем данные о сотруднике
      const person = await prisma.airlinePersonal.delete({
        where: { id }
      })
      // Получаем обновленную информацию об авиакомпании, к которой относился сотрудник
      const airlineWithRelations = await prisma.airline.findUnique({
        where: { id: person.airlineId }
      })
      // Публикация события обновления авиакомпании
      pubsub.publish(AIRLINE_UPDATED, {
        airlineUpdated: airlineWithRelations
      })
      return airlineWithRelations
    }
  },

  // Subscription-резольверы для получения обновлений в реальном времени через PubSub
  Subscription: {
    // Подписка на событие создания авиакомпании
    airlineCreated: {
      subscribe: () => pubsub.asyncIterator([AIRLINE_CREATED])
    },
    // Подписка на событие обновления авиакомпании
    airlineUpdated: {
      subscribe: () => pubsub.asyncIterator([AIRLINE_UPDATED])
    }
  },

  // Резольверы для полей типа Airline (авиакомпания)
  Airline: {
    // Получение списка департаментов, связанных с авиакомпанией
    department: async (parent) => {
      return await prisma.airlineDepartment.findMany({
        where: { airlineId: parent.id }
      })
    },
    // Получение списка сотрудников, привязанных к авиакомпании
    staff: async (parent) => {
      return await prisma.airlinePersonal.findMany({
        where: { airlineId: parent.id }
      })
    }
  },

  // Резольверы для полей типа AirlineDepartment (департамент авиакомпании)
  AirlineDepartment: {
    // Получение списка пользователей, привязанных к департаменту
    users: async (parent) => {
      return await prisma.user.findMany({
        where: { airlineDepartmentId: parent.id }
      })
    },
    // Получение списка сотрудников, связанных с департаментом (проверить логику при необходимости)
    staff: async (parent) => {
      return await prisma.airlinePersonal.findMany({
        where: { airlineId: parent.id }
      })
    }
  },

  // Резольверы для полей типа AirlinePersonal (сотрудник авиакомпании)
  AirlinePersonal: {
    // Получение записей hotelChess, связанных с сотрудником, с включением информации об отеле
    hotelChess: async (parent) => {
      const hotelChessEntries = await prisma.hotelChess.findMany({
        where: { clientId: parent.id },
        include: { hotel: true }
      })
      return hotelChessEntries
    }
  }
}

export default airlineResolver
