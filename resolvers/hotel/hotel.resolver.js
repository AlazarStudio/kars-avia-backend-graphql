// hotel.resolver.js

import { prisma } from "../../prisma.js"
// import { PubSub } from "graphql-subscriptions"
import GraphQLUpload from "graphql-upload/GraphQLUpload.mjs"
import uploadImage from "../../exports/uploadImage.js"
import { logAction } from "../../exports/logaction.js"
import {
  superAdminMiddleware,
  adminMiddleware,
  hotelAdminMiddleware,
  hotelModerMiddleware,
  hotelMiddleware
} from "../../middlewares/authMiddleware.js"

import { pubsub, REQUEST_UPDATED } from "../../exports/pubsub.js"

// const pubsub = new PubSub()

const hotelResolver = {
  Upload: GraphQLUpload,

  Query: {
    hotels: async (_, {}, context) => {
      return await prisma.hotel.findMany({
        include: {
          categories: true,
          rooms: true,
          tariffs: true,
          prices: true,
          hotelChesses: true
        }
      })
    },
    hotel: async (_, { id }, context) => {
      return await prisma.hotel.findUnique({
        where: { id },
        include: {
          categories: true,
          rooms: true,
          tariffs: true,
          prices: true,
          hotelChesses: true
        }
      })
    }
  },

  Mutation: {
    createHotel: async (_, { input, images }, context) => {
      adminMiddleware(context)

      let imagePaths = []
      if (images && images.length > 0) {
        for (const image of images) {
          imagePaths.push(await uploadImage(image))
        }
      }

      const data = {
        ...input,
        images: imagePaths
      }

      logAction(context.user.id, `Create Hotel: ${data.name}`, data)

      return await prisma.hotel.create({
        data,
        include: {
          categories: true,
          rooms: true,
          tariffs: true
        }
      })
    },

    updateHotel: async (_, { id, input, images }, context) => {
      hotelAdminMiddleware(context)

      let imagePaths = []
      if (images && images.length > 0) {
        for (const image of images) {
          imagePaths.push(await uploadImage(image))
        }
      }

      const { categories, rooms, tariffs, prices, hotelChesses, ...restInput } =
        input

      const updatedData = {
        categories,
        rooms,
        tariffs,
        prices,
        hotelChesses,
        ...restInput
      }

      logAction(context.user.id, `Upadate Hotel: `, updatedData)

      try {
        // Обновляем поля отеля
        const updatedHotel = await prisma.hotel.update({
          where: { id },
          data: {
            ...restInput,
            ...(imagePaths.length > 0 && { images: { set: imagePaths } })
          }
        })

        //
        if (hotelChesses) {
          for (const hotelChess of hotelChesses) {
            if (hotelChess.id) {
              await prisma.hotelChess.update({
                where: { id: hotelChess.id },
                data: {
                  public: hotelChess.public,
                  room: hotelChess.room,
                  place: hotelChess.place,
                  start: hotelChess.start,
                  startTime: hotelChess.startTime,
                  end: hotelChess.end,
                  endTime: hotelChess.endTime,
                  clientId: hotelChess.clientId,
                  requestId: hotelChess.requestId
                }
              })
              const updatedRequest = await prisma.request.update({
                where: { id: hotelChess.requestId },
                data: {
                  status: "done",
                  hotel: {
                    connect: { id: id }
                  },
                  hotelChess: {
                    connect: { id: hotelChess.id }
                  }
                }
              })
              pubsub.publish(REQUEST_UPDATED, {
                requestUpdated: updatedRequest
              })
            } else {
              await prisma.hotelChess.create({
                data: {
                  // hotelId: id,
                  hotel: {
                    connect: { id: id }
                  },
                  public: hotelChess.public,
                  room: hotelChess.room,
                  place: hotelChess.place,
                  start: hotelChess.start,
                  startTime: hotelChess.startTime,
                  end: hotelChess.end,
                  endTime: hotelChess.endTime,
                  // clientId: hotelChess.clientId,
                  client: { connect: { id: hotelChess.clientId } },
                  // requestId: hotelChess.requestId,
                  request: {
                    connect: { id: hotelChess.requestId }
                  }
                }
              })
              const updatedRequest = await prisma.request.update({
                where: { id: hotelChess.requestId },
                data: {
                  status: "done",
                  hotel: {
                    connect: { id: id }
                  }
                }
              })
              pubsub.publish(REQUEST_UPDATED, {
                requestUpdated: updatedRequest
              })
            }
          }
        }

        // Обработка тарифов
        if (tariffs) {
          for (const tariff of tariffs) {
            if (tariff.id) {
              await prisma.tariff.update({
                where: { id: tariff.id },
                data: {
                  name: tariff.name,
                  categoryId: tariff.categoryId
                }
              })
            } else {
              await prisma.tariff.create({
                data: {
                  hotelId: id,
                  name: tariff.name,
                  categoryId: tariff.categoryId
                }
              })
            }
          }
        }

        // Обработка категорий
        if (categories) {
          for (const category of categories) {
            if (category.id) {
              await prisma.category.update({
                where: { id: category.id },
                data: {
                  name: category.name,
                  tariffId: category.tariffId
                }
              })
            } else {
              await prisma.category.create({
                data: {
                  hotelId: id,
                  name: category.name,
                  tariffId: category.tariffId
                }
              })
            }
          }
        }

        // Обработка цен
        if (prices) {
          for (const price of prices) {
            if (price.id) {
              await prisma.price.update({
                where: { id: price.id },
                data: {
                  amount: price.amount,
                  amountair: price.amountair,
                  category: {
                    connect: { id: price.categoryId }
                  },
                  tariff: {
                    connect: { id: price.tariffId }
                  }
                }
              })
            } else {
              await prisma.price.create({
                data: {
                  amount: price.amount,
                  amountair: price.amountair,
                  category: {
                    connect: { id: price.categoryId }
                  },
                  tariff: {
                    connect: { id: price.tariffId }
                  },
                  hotel: {
                    connect: { id: id }
                  }
                }
              })
            }
          }
        }

        // Обработка комнат
        if (rooms) {
          for (const room of rooms) {
            if (room.id) {
              await prisma.room.update({
                where: { id: room.id },
                data: {
                  name: room.name,
                  tariffId: room.tariffId,
                  categoryId: room.categoryId,
                  places: room.places
                }
              })
            } else {
              await prisma.room.create({
                data: {
                  hotelId: id,
                  name: room.name,
                  tariffId: room.tariffId,
                  categoryId: room.categoryId,
                  places: room.places
                }
              })
            }
          }
        }

        // Получаем обновленный отель с вложенными данными
        const hotelWithRelations = await prisma.hotel.findUnique({
          where: { id },
          include: {
            categories: true,
            rooms: true,
            tariffs: true,
            prices: true,
            hotelChesses: true
          }
        })

        return hotelWithRelations
      } catch (error) {
        console.error("Ошибка при обновлении отеля:", error)
        throw new Error("Не удалось обновить отель")
      }
    },

    assignPassengersToHotel: async (_, { reservationId, hotelId, passengerIds }, context) => {
      const hotel = await prisma.hotel.findUnique({ where: { id: hotelId } });
      if (!hotel) {
        throw new Error("Отель не найден");
      }
    
      const assignedPassengers = [];
    
      for (const passengerId of passengerIds) {
        const passenger = await prisma.passenger.findUnique({
          where: { id: passengerId },
          include: { family: true },
        });
    
        if (!passenger) {
          throw new Error(`Пассажир с ID ${passengerId} не найден`);
        }
    
        // Validate that the passenger belongs to the specified reservation
        if (passenger.reserveId !== reservationId) {
          throw new Error(`Пассажир ${passengerId} не принадлежит к указанному резерву`);
        }
    
        if (passenger.hotelId) {
          throw new Error(`Пассажир ${passengerId} уже назначен в отель`);
        }
    
        if (passenger.familyId) {
          // Fetch all family members
          const familyMembers = await prisma.passenger.findMany({
            where: { familyId: passenger.familyId },
          });
    
          // Ensure all family members belong to the same reservation
          for (const member of familyMembers) {
            if (member.reserveId !== reservationId) {
              throw new Error(`Член семьи ${member.id} не принадлежит к указанному резерву`);
            }
          }
    
          // Check if any family member is already assigned to a different hotel
          for (const member of familyMembers) {
            if (member.hotelId && member.hotelId !== hotelId) {
              throw new Error(`Член семьи ${member.id} уже назначен в другой отель`);
            }
          }
    
          // Assign all family members to the hotel
          for (const member of familyMembers) {
            await prisma.passenger.update({
              where: { id: member.id },
              data: { hotelId: hotelId },
            });
            assignedPassengers.push(member);
          }
        } else {
          // Assign individual passenger
          await prisma.passenger.update({
            where: { id: passengerId },
            data: { hotelId: hotelId },
          });
          assignedPassengers.push(passenger);
        }
      }
    
      // Optional: Log the action
      await logAction({
        userId: context.user.id,
        action: 'assign_passengers_to_hotel',
        description: {
          reservationId,
          hotelId,
          passengerIds: assignedPassengers.map((p) => p.id),
        },
        hotelId,
      });
    
      return assignedPassengers;
    },    
    // ----------------------------------------------------------------
    deleteHotel: async (_, { id }, context) => {
      hotelAdminMiddleware(context)

      // logAction(context.user.id, `delete Hotel: ${data.name}`, data)

      return await prisma.hotel.delete({
        where: { id }
      })
    },

    deleteRoom: async (_, { id }, context) => {
      hotelAdminMiddleware(context)

      // logAction(context.user.id, `delete Room: ${data.name}`, data)

      return await prisma.room.delete({
        where: { id }
      })
    },

    deletePrice: async (_, { id }, context) => {
      hotelAdminMiddleware(context)

      // logAction(context.user.id, `delete Price: ${data.name}`, data)

      return await prisma.price.delete({
        where: { id }
      })
    },

    deleteTariff: async (_, { id }, context) => {
      hotelAdminMiddleware(context)

      // logAction(context.user.id, `delete Tariff: ${data.name}`, data)

      return await prisma.tariff.delete({
        where: { id }
      })
    },

    deleteCategory: async (_, { id }, context) => {
      hotelAdminMiddleware(context)

      // logAction(context.user.id, `delete Category: ${data.name}`, data)

      return await prisma.category.delete({
        where: { id }
      })
    }
    // ----------------------------------------------------------------
  },

  Hotel: {
    categories: async (parent) => {
      return await prisma.category.findMany({
        where: { hotelId: parent.id }
      })
    },
    rooms: async (parent) => {
      return await prisma.room.findMany({
        where: { hotelId: parent.id }
      })
    },
    tariffs: async (parent) => {
      return await prisma.tariff.findMany({
        where: { hotelId: parent.id }
      })
    },
    prices: async (parent) => {
      return await prisma.price.findMany({
        where: { hotelId: parent.id }
      })
    },
    hotelChesses: async (parent) => {
      return await prisma.hotelChess.findMany({
        where: { hotelId: parent.id },
        include: { client: true }
      })
    }
  },

  HotelChess: {
    client: async (parent) => {
      return await prisma.airlinePersonal.findUnique({
        where: { id: parent.clientId }
      })
    },
    request: async (parent) => {
      return await prisma.request.findUnique({
        where: { id: parent.requestId }
      })
    }
  },

  Tariff: {
    prices: async (parent) => {
      return await prisma.price.findMany({
        where: { tariffId: parent.id },
        include: {
          category: true
        }
      })
    },
    category: async (parent) => {
      return await prisma.category.findMany({
        where: { tariffId: parent.id }
      })
    }
  },

  Category: {
    rooms: async (parent) => {
      return await prisma.room.findMany({
        where: { categoryId: parent.id }
      })
    },
    prices: async (parent) => {
      return await prisma.price.findMany({
        where: { categoryId: parent.id }
        // include: {
        //   tariff: true
        // }
      })
    },
    tariffs: async (parent) => {
      return await prisma.tariff.findUnique({
        where: { id: parent.tariffId }
      })
    }
  },

  Room: {
    category: async (parent) => {
      return await prisma.category.findUnique({
        where: { id: parent.categoryId }
      })
    },
    tariff: async (parent) => {
      return await prisma.tariff.findUnique({
        where: { id: parent.tariffId }
      })
    }
  },

  Price: {
    category: async (parent) => {
      return await prisma.category.findUnique({
        where: { id: parent.categoryId }
      })
    },
    tariff: async (parent) => {
      return await prisma.tariff.findUnique({
        where: { id: parent.tariffId }
      })
    }
  }
}

export default hotelResolver
