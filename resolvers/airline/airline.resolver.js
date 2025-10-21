import { prisma } from "../../prisma.js"
import GraphQLUpload from "graphql-upload/GraphQLUpload.mjs"
import { uploadImage } from "../../exports/uploadImage.js"
import logAction from "../../exports/logaction.js"
import {
  adminMiddleware,
  airlineAdminMiddleware,
  allMiddleware
} from "../../middlewares/authMiddleware.js"
import {
  pubsub,
  AIRLINE_CREATED,
  AIRLINE_UPDATED
} from "../../exports/pubsub.js"

const airlineResolver = {
  Upload: GraphQLUpload,

  Query: {
    airlines: async (_, { pagination }, context) => {
      await allMiddleware(context)
      const { skip, take, all } = pagination || {}
      const totalCount = await prisma.airline.count({ where: { active: true } })
      const airlines = all
        ? await prisma.airline.findMany({
            where: { active: true },
            include: {
              staff: true,
              department: true,
              prices: true
            },
            orderBy: { name: "asc" }
          })
        : await prisma.airline.findMany({
            where: { active: true },
            skip: skip ? skip * take : undefined,
            take: take || undefined,
            include: {
              staff: true,
              department: true,
              prices: true
            },
            orderBy: { name: "asc" }
          })
      const totalPages = take && !all ? Math.ceil(totalCount / take) : 1
      return { airlines, totalCount, totalPages }
    },

    airline: async (_, { id }, context) => {
      await allMiddleware(context)
      return await prisma.airline.findUnique({
        where: { id },
        include: {
          staff: true,
          department: true,
          logs: true,
          prices: true, // включаем тарифы
          airportOnAirlinePrice: true
        }
      })
    },

    airlineStaff: async (_, { id }, context) => {
      await allMiddleware(context)
      return await prisma.airlinePersonal.findUnique({
        where: { id },
        include: { hotelChess: true, position: true }
      })
    },

    airlineStaffs: async (_, { airlineId, city }, context) => {
      await allMiddleware(context)
      // add pagination

      return await prisma.airlinePersonal.findMany({
        where: { airlineId, active: true },
        include: { hotelChess: true, position: true },
        orderBy: { name: "asc" }
      })
    },

    airlineDepartment: async (_, { id }, context) => {
      await allMiddleware(context)

      return await prisma.airlineDepartment.findUnique({
        where: { id }
      })
    }
  },

  Mutation: {
    createAirline: async (_, { input, images }, context) => {
      const { user } = context
      await adminMiddleware(context)
      // const defaultMealPrice = { breakfast: 0, lunch: 0, dinner: 0 }

      // Для цен теперь ожидаем массив тарифных договоров
      // Если input.prices не переданы, можно установить пустой массив
      const airlinePriceData = input.prices || []

      let imagePaths = []
      if (images && images.length > 0) {
        for (const image of images) {
          const uploadedPath = await uploadImage(image)
          imagePaths.push(uploadedPath)
        }
      }

      // Основные данные
      const data = {
        ...input,
        // mealPrice: input.mealPrice || defaultMealPrice,
        images: imagePaths,
        // Используем nested create для создания тарифных договоров
        prices: {
          create: airlinePriceData.map((priceInput) => ({
            prices: priceInput.prices,
            airports: {
              create: priceInput.airportIds
                ? priceInput.airportIds.map((airportId) => ({
                    airport: { connect: { id: airportId } }
                  }))
                : []
            }
          }))
        }
      }

      const createdAirline = await prisma.airline.create({
        data,
        include: {
          staff: true,
          department: true,
          prices: true
        }
      })

      await logAction({
        context,
        action: "create_airline",
        description: `Пользователь <span style='color:#545873'>${user.name}</span> добавил авиакомпанию <span style='color:#545873'>${createdAirline.name}</span>`,
        airlineName: createdAirline.name,
        airlineId: createdAirline.id
      })
      pubsub.publish(AIRLINE_CREATED, { airlineCreated: createdAirline })
      return createdAirline
    },

    updateAirline: async (_, { id, input, images }, context) => {
      const { user } = context
      await airlineAdminMiddleware(context)
      let imagePaths = []
      if (images && images.length > 0) {
        for (const image of images) {
          imagePaths.push(await uploadImage(image))
        }
      }
      // Извлекаем поля для обновления (например, department, staff, position и новые цены)
      const { department, staff, prices, ...restInput } = input
      try {
        const previousAirlineData = await prisma.airline.findUnique({
          where: { id }
          // select: { mealPrice: true }
        })

        // Обновляем основные данные авиакомпании
        const updatedAirline = await prisma.airline.update({
          where: { id },
          data: {
            ...restInput,
            // mealPrice: {
            //   ...previousAirlineData.mealPrice,
            //   ...input.mealPrice
            // },
            ...(imagePaths.length > 0 && { images: { set: imagePaths } })
          }
        })

        if (prices) {
          for (const priceInput of prices) {
            if (priceInput.id) {
              // Обновляем существующий тариф
              await prisma.airlinePrice.update({
                where: { id: priceInput.id },
                data: {
                  name: priceInput.name,
                  prices: priceInput.prices,
                  mealPrice: priceInput.mealPrice
                }
              })

              // Удаляем старые связи
              await prisma.airportOnAirlinePrice.deleteMany({
                where: { airlinePriceId: priceInput.id }
              })

              // Создаём новые связи для тарифа
              if (priceInput.airportIds && priceInput.airportIds.length > 0) {
                for (const airportId of priceInput.airportIds) {
                  await prisma.airportOnAirlinePrice.create({
                    data: {
                      airlineId: id,
                      airportId: airportId,
                      airlinePriceId: priceInput.id
                    }
                  })
                }
              }
            } else {
              // Создаем новый тариф без id
              const createdPrice = await prisma.airlinePrice.create({
                data: {
                  airlineId: id,
                  name: priceInput.name,
                  prices: priceInput.prices,
                  mealPrice: priceInput.mealPrice
                }
              })

              if (priceInput.airportIds && priceInput.airportIds.length > 0) {
                for (const airportId of priceInput.airportIds) {
                  await prisma.airportOnAirlinePrice.create({
                    data: {
                      airlineId: id,
                      airportId: airportId,
                      airlinePriceId: createdPrice.id
                    }
                  })
                }
              }
            }
          }
        }

        // Обработка департаментов авиакомпании
        if (department) {
          for (const depart of department) {
            if (depart.id) {
              // Обновляем данные департамента, например, name, email, users и т.д.
              await prisma.airlineDepartment.update({
                where: { id: depart.id },
                data: {
                  name: depart.name,
                  email: depart.email,
                  accessMenu: depart.accessMenu,
                  users: {
                    connect: depart.userIds
                      ? depart.userIds.map((userId) => ({ id: userId }))
                      : []
                  }
                }
              })

              // Обновляем связи с должностями
              if (depart.positionIds) {
                // Получаем текущие связи (id должностей, связанных с департаментом)
                const currentPositions =
                  await prisma.positionOnDepartment.findMany({
                    where: { airlineDepartmentId: depart.id },
                    select: { positionId: true }
                  })
                const currentIds = currentPositions.map(
                  (item) => item.positionId
                )
                const newIds = depart.positionIds

                // Вычисляем какие id нужно добавить, а какие убрать
                const toConnect = newIds.filter(
                  (id) => !currentIds.includes(id)
                )
                const toDisconnect = currentIds.filter(
                  (id) => !newIds.includes(id)
                )

                // Добавляем новые связи
                if (toConnect.length > 0) {
                  await prisma.positionOnDepartment.createMany({
                    data: toConnect.map((positionId) => ({
                      airlineDepartmentId: depart.id,
                      positionId: positionId
                    }))
                  })
                }

                // Удаляем отсутствующие связи
                if (toDisconnect.length > 0) {
                  await prisma.positionOnDepartment.deleteMany({
                    where: {
                      airlineDepartmentId: depart.id,
                      positionId: { in: toDisconnect }
                    }
                  })
                }
              }

              await logAction({
                context,
                action: "update_airline",
                description: `Пользователь <span style='color:#545873'>${user.name}</span> изменил данные в отделе <span style='color:#545873'>${depart.name}</span> `,
                airlineId: id
              })
            } else {
              // Создаем новый департамент
              const newDepart = await prisma.airlineDepartment.create({
                data: {
                  airlineId: id,
                  name: depart.name,
                  email: depart.email,
                  accessMenu: depart.accessMenu,
                  users: {
                    connect: depart.userIds
                      ? depart.userIds.map((userId) => ({ id: userId }))
                      : []
                  }
                }
              })

              if (depart.positionIds) {
                // Получаем текущие связи (id должностей, связанных с департаментом)
                const currentPositions =
                  await prisma.positionOnDepartment.findMany({
                    where: { airlineDepartmentId: newDepart.id },
                    select: { positionId: true }
                  })
                const currentIds = currentPositions.map(
                  (item) => item.positionId
                )
                const newIds = depart.positionIds

                // Вычисляем какие id нужно добавить, а какие убрать
                const toConnect = newIds.filter(
                  (id) => !currentIds.includes(id)
                )
                const toDisconnect = currentIds.filter(
                  (id) => !newIds.includes(id)
                )

                // Добавляем новые связи
                if (toConnect.length > 0) {
                  await prisma.positionOnDepartment.createMany({
                    data: toConnect.map((positionId) => ({
                      airlineDepartmentId: newDepart.id,
                      positionId: positionId
                    }))
                  })
                }

                // Удаляем отсутствующие связи
                if (toDisconnect.length > 0) {
                  await prisma.positionOnDepartment.deleteMany({
                    where: {
                      airlineDepartmentId: newDepart.id,
                      positionId: { in: toDisconnect }
                    }
                  })
                }
              }

              await logAction({
                context,
                action: "update_airline",
                description: `Пользователь <span style='color:#545873'>${user.name}</span> добавил отдел <span style='color:#545873'>${depart.name}</span> `,
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
                  positionId: person.positionId,
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
                  positionId: person.positionId,
                  gender: person.gender
                }
              })
              await logAction({
                context,
                action: "update_airline",
                description: `Пользователь <span style='color:#545873'> ${user.name} </span> добавил пользователя <span style='color:#545873'>${person.name}</span> `,
                airlineId: id
              })
            }
          }
        }

        // Обработка должностей
        // if (position) {
        //   for (const pos of position) {
        //     if (pos.id) {
        //       await prisma.position.update({
        //         where: { id: pos.id },
        //         data: {
        //           name: pos.name
        //           // airlineDepartment: { connect: { id: pos.airlineDepartmentId } }
        //         }
        //       })
        //     } else {
        //       await prisma.position.create({
        //         data: {
        //           name: pos.name,
        //           airlineId: id
        //           // airlineDepartmentId: pos.airlineDepartmentId ? { connect: { id: pos.airlineDepartmentId } } : null
        //         }
        //       })
        //     }
        //   }
        // }

        const airlineWithRelations = await prisma.airline.findUnique({
          where: { id },
          include: { department: true, staff: true, prices: true }
        })
        await logAction({
          context,
          action: "update_airline",
          description: `Пользователь <span style='color:#545873'>${user.name}</span> обновил данные авиакомпании <span style='color:#545873'>${airlineWithRelations.name}</span>`,
          airlineId: id
        })
        pubsub.publish(AIRLINE_UPDATED, {
          airlineUpdated: airlineWithRelations
        })
        return airlineWithRelations
      } catch (error) {
        const timestamp = new Date().toISOString()
        console.error(
          timestamp,
          "\nОшибка при обновлении авиакомпании:\n",
          error
        )
        throw new Error("Не удалось обновить авиакомпанию")
      }
    },

    deleteAirline: async (_, { id }, context) => {
      // Проверка прав администратора авиакомпании
      await adminMiddleware(context)
      // Удаляем авиакомпанию и возвращаем связанные с ней данные (например, персонал)
      const deletedAirline = await prisma.airline.update({
        where: { id },
        include: {
          staff: true
        },
        data: {
          active: false
        }
      })
      // await prisma.user.updateMany({
      //   where: { airlineId: id },
      //   data: { active: false }
      // })
      // Если у авиакомпании есть изображения, удаляем их (функция deleteImage предполагается определённой в другом месте)
      // if (deletedAirline.images && deletedAirline.images.length > 0) {
      //   for (const imagePath of deletedAirline.images) {
      //     await deleteImage(imagePath)
      //   }
      // }
      return deletedAirline
    },

    // Удаление департамента авиакомпании
    deleteAirlineDepartment: async (_, { id }, context) => {
      // Проверка прав администратора авиакомпании
      await airlineAdminMiddleware(context)
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
      await airlineAdminMiddleware(context)
      // Удаляем данные о сотруднике
      const person = await prisma.airlinePersonal.update({
        where: { id },
        data: {
          active: false
        }
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

  Subscription: {
    airlineCreated: {
      subscribe: () => pubsub.asyncIterator([AIRLINE_CREATED])
    },
    airlineUpdated: {
      subscribe: () => pubsub.asyncIterator([AIRLINE_UPDATED])
    }
  },

  Airline: {
    department: async (parent) => {
      return await prisma.airlineDepartment.findMany({
        where: { airlineId: parent.id, active: true }
      })
    },
    staff: async (parent) => {
      return await prisma.airlinePersonal.findMany({
        where: { airlineId: parent.id, active: true }
      })
    },
    // position: async (parent) => {
    //   return await prisma.position.findMany({
    //     where: { airlineId: parent.id }
    //   })
    // },
    logs: async (parent, { pagination }) => {
      const { skip, take } = pagination || {}
      const totalCount = await prisma.log.count({
        where: { airlineId: parent.id }
      })
      const logs = await prisma.log.findMany({
        where: { airlineId: parent.id },
        include: { user: true },
        skip,
        take,
        orderBy: { createdAt: "desc" }
      })
      const totalPages = Math.ceil(totalCount / take)
      return { totalCount, totalPages, logs }
    },
    // Определяем резольвер для поля prices
    prices: async (parent) => {
      return await prisma.airlinePrice.findMany({
        where: { airlineId: parent.id },
        include: {
          airports: {
            include: { airport: true }
          }
        }
      })
    },
    // При необходимости – резольвер для airportOnAirlinePrice
    airportOnAirlinePrice: async (parent) => {
      return await prisma.airportOnAirlinePrice.findMany({
        where: { airlineId: parent.id },
        include: { airport: true }
      })
    },
    // Определяем резольвер для поля airlineContract
    airlineContract: async (parent) => {
      return await prisma.airlineContract.findMany({
        where: { airlineId: parent.id }
      })
    }
  },

  AirlineDepartment: {
    users: async (parent) => {
      return await prisma.user.findMany({
        where: { airlineDepartmentId: parent.id, active: true }
      })
    },
    staff: async (parent) => {
      return await prisma.airlinePersonal.findMany({
        where: { airlineDepartmentId: parent.id, active: true }
      })
    },
    position: async (parent) => {
      const posOnDept = await prisma.positionOnDepartment.findMany({
        where: { airlineDepartmentId: parent.id },
        include: { position: true }
      })
      return posOnDept.map((record) => record.position)
    }
  },

  AirlinePersonal: {
    // hotelChess: async (parent) => {
    //   const hotelChessEntries = await prisma.hotelChess.findMany({
    //     where: { clientId: parent.id },
    //     include: { hotel: true }
    //   })
    //   return hotelChessEntries
    // },

    hotelChess: async (parent, args) => {
      const { hcPagination = {} } = args
      const { start, end, city } = hcPagination

      const where = { clientId: parent.id }
      if (start && end) {
        where.AND = [
          { start: { lte: new Date(end) } },
          { end: { gte: new Date(start) } }
        ]
      }

      if (city && city.trim()) {
        const res = await prisma.$runCommandRaw({
          aggregate: "Hotel",
          pipeline: [
            {
              $match: {
                $or: [
                  {
                    "information.city": { $regex: city.trim(), $options: "i" }
                  },
                  { "airport.city": { $regex: city.trim(), $options: "i" } }
                ]
              }
            },
            { $project: { _id: 1 } }
          ],
          cursor: {}
        })
        const hotelIds = (res?.cursor?.firstBatch ?? []).map((d) =>
          String(d._id)
        )
        if (!hotelIds.length) return []
        ;(where.AND ??= []).push({ hotelId: { in: hotelIds } })
      }

      return prisma.hotelChess.findMany({ where, include: { hotel: true } })
    },
    position: async (parent) => {
      if (parent.positionId) {
        return await prisma.position.findUnique({
          where: { id: parent.positionId }
        })
      }
      return null
    }
  }
}

export default airlineResolver
