if (hotelChesses) {
  for (const hotelChess of hotelChesses) {
    let mealPlanData = null
    if (hotelChess.start && hotelChess.end) {
      const arrival = `${hotelChess.start}`
      const departure = `${hotelChess.end}`
      // Получаем настройки питания от отеля (используем hotelChess.hotelId или текущий id)
      const hotelInfo = await prisma.hotel.findUnique({
        where: { id: hotelChess.hotelId || id },
        select: {
          breakfast: true,
          lunch: true,
          dinner: true,
          name: true
        }
      })
      if (hotelInfo) {
        const mealTimes = {
          breakfast: hotelInfo.breakfast,
          lunch: hotelInfo.lunch,
          dinner: hotelInfo.dinner
        }
        const mealPlan = calculateMeal(arrival, departure, mealTimes)
        mealPlanData = {
          included: true,
          breakfast: mealPlan.totalBreakfast,
          lunch: mealPlan.totalLunch,
          dinner: mealPlan.totalDinner,
          dailyMeals: mealPlan.dailyMeals
        }
      }
    }

    if (hotelChess.id) {
      // Перед обновлением получаем предыдущие данные для логирования
      const previousHotelChessData = await prisma.hotelChess.findUnique({
        where: { id: hotelChess.id }
      })
      // Обновляем существующую запись
      await prisma.hotelChess.update({
        where: { id: hotelChess.id },
        data: {
          public: hotelChess.public,
          room: hotelChess.room,
          place: hotelChess.place,
          start: hotelChess.start,
          end: hotelChess.end,
          clientId: hotelChess.clientId,
          requestId: hotelChess.requestId,
          reserveId: hotelChess.reserveId,
          status: hotelChess.status,
          mealPlan: mealPlanData
        }
      })

      if (hotelChess.requestId) {
        // Обработка для заявки (request)
        const room = await prisma.room.findFirst({
          where: { hotelId: hotelChess.hotelId, name: hotelChess.room }
        })
        const updatedRequest = await prisma.request.update({
          where: { id: hotelChess.requestId },
          data: {
            status: "transferred",
            hotel: { connect: { id } },
            hotelChess: { connect: { id: hotelChess.id } },
            roomCategory: room.category,
            roomNumber: room.name,
            mealPlan: mealPlanData
          }
        })
        await logAction({
          context,
          action: "update_hotel_chess",
          description: `Заявка № <span style='color:#545873'>${updatedRequest.requestNumber}</span> была перенесена в номер <span style='color:#545873'>${hotelChess.room}</span> пользователем <span style='color:#545873'>${user.name}</span>`,
          oldData: previousHotelChessData,
          newData: hotelChess,
          hotelId: hotelChess.hotelId,
          requestId: updatedRequest.id
        })
        pubsub.publish(REQUEST_UPDATED, {
          requestUpdated: updatedRequest
        })
      } else if (hotelChess.reserveId) {
        // Обработка для брони (reserve)
        await prisma.reserve.update({
          where: { id: hotelChess.reserveId },
          data: {
            hotelChess: { connect: { id: hotelChess.id } },
            mealPlan: mealPlanData
          }
        })
        await logAction({
          context,
          action: "update_hotel_chess",
          description: `Бронь № <span style='color:#545873'>${hotelChess.reserveId}</span> была перенесена в номер <span style='color:#545873'>${hotelChess.room}</span> пользователем <span style='color:#545873'>${user.name}</span>`,
          oldData: previousHotelChessData,
          newData: hotelChess,
          hotelId: hotelChess.hotelId,
          reserveId: hotelChess.reserveId
        })
      }
    } else {
      // Создание новой записи для HotelChess
      let newHotelChess
      if (hotelChess.reserveId) {
        const reserve = await prisma.reserve.findUnique({
          where: { id: hotelChess.reserveId },
          select: { reserveForPerson: true }
        })
        const reserveForPerson = reserve?.reserveForPerson
        if (reserveForPerson === true) {
          newHotelChess = await prisma.hotelChess.create({
            data: {
              hotel: { connect: { id } },
              public: hotelChess.public,
              room: hotelChess.room,
              place: hotelChess.place,
              start: hotelChess.start,
              end: hotelChess.end,
              client: { connect: { id: hotelChess.clientId } },
              reserve: { connect: { id: hotelChess.reserveId } },
              status: hotelChess.status,
              mealPlan: mealPlanData
            }
          })
        } else if (reserveForPerson === false) {
          try {
            newHotelChess = await prisma.hotelChess.create({
              data: {
                hotel: { connect: { id } },
                public: hotelChess.public,
                room: hotelChess.room,
                place: hotelChess.place,
                start: hotelChess.start,
                end: hotelChess.end,
                passenger: { connect: { id: hotelChess.clientId } },
                reserve: { connect: { id: hotelChess.reserveId } },
                status: hotelChess.status,
                mealPlan: mealPlanData
              }
            })
          } catch (e) {
            console.error("Error: ", e)
            throw new Error(
              "Ошибка при создании клиентского бронирования: " +
                e.message +
                "\n\n :" +
                e.stack
            )
          }
        }
      } else {
        newHotelChess = await prisma.hotelChess.create({
          data: {
            hotel: { connect: { id } },
            public: hotelChess.public,
            room: hotelChess.room,
            place: hotelChess.place,
            start: hotelChess.start,
            end: hotelChess.end,
            client: { connect: { id: hotelChess.clientId } },
            request: hotelChess.requestId
              ? { connect: { id: hotelChess.requestId } }
              : undefined,
            status: hotelChess.status,
            mealPlan: mealPlanData
          }
        })
      }

      if (hotelChess.requestId) {
        // Обработка для новой заявки (request)
        const room = await prisma.room.findUnique({
          where: { hotelId: hotelChess.hotelId, id: hotelChess.roomId }
        })

        const arrival = `${hotelChess.start}`
        const departure = `${hotelChess.end}`
        const hotel = await prisma.hotel.findUnique({
          where: { id },
          select: {
            breakfast: true,
            lunch: true,
            dinner: true,
            name: true
          }
        })
        const mealTimes = {
          breakfast: hotel.breakfast,
          lunch: hotel.lunch,
          dinner: hotel.dinner
        }
        const mealPlan = calculateMeal(arrival, departure, mealTimes)

        const updatedRequest = await prisma.request.update({
          where: { id: hotelChess.requestId },
          data: {
            status: "done",
            hotel: { connect: { id } },
            mealPlan: mealPlanData,
            roomCategory: room.category,
            room: { connect: room.id }
          },
          include: {
            hotel: true,
            person: true,
            hotelChess: true
          }
        })

        const oldChat = await prisma.chat.findFirst({
          where: {
            request: { id: updatedRequest.id },
            separator: "hotel"
          }
        })

        if (!oldChat) {
          const newChat = await prisma.chat.create({
            data: {
              request: { connect: { id: updatedRequest.id } },
              separator: "hotel"
            }
          })
          await prisma.chatUser.create({
            data: {
              chat: { connect: { id: newChat.id } },
              user: { connect: { id: user.id } }
            }
          })
        }

        await logAction({
          context,
          action: "update_hotel_chess",
          description: `<span style='color:#545873'>${updatedRequest.person.name}</span> был размещён в отеле <span style='color:#545873'>${hotelInfo?.name}</span> в номер <span style='color:#545873'>${hotelChess.room}</span> по заявке № <span style='color:#545873'>${updatedRequest.requestNumber}</span> пользователем <span style='color:#545873'>${user.name}</span>`,
          oldData: null,
          newData: newHotelChess,
          hotelId: hotelChess.hotelId,
          requestId: hotelChess.requestId,
          reserveId: hotelChess.reserveId
        })

        pubsub.publish(REQUEST_UPDATED, {
          requestUpdated: updatedRequest
        })
      }
      // else if (hotelChess.reserveId) {
      //   // Обработка для новой брони (reserve)
      //   await prisma.reserve.update({
      //     where: { id: hotelChess.reserveId },
      //     data: {
      //       hotelChess: { connect: { id: newHotelChess.id } },
      //       mealPlan: mealPlanData
      //     }
      //   })
      //   await logAction({
      //     context,
      //     action: "update_hotel_chess",
      //     description: `Бронь № ${hotelChess.reserveId} была создана пользователем ${user.name}`,
      //     oldData: null,
      //     newData: newHotelChess,
      //     hotelId: hotelChess.hotelId
      //   })
      // }
    }
  }
}

// ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------

// Предполагается, что currentHotelId содержит идентификатор текущего отеля
const currentHotelId = id // Замените, если используется другое имя переменной

if (hotelChesses) {
  for (const hotelChess of hotelChesses) {
    let mealPlanData = null

    // Если заданы даты начала и окончания, вычисляем план питания
    if (hotelChess.start && hotelChess.end) {
      // Преобразуем даты в строковый формат (например, ISO)
      const arrival = hotelChess.start.toString()
      const departure = hotelChess.end.toString()

      // Ищем настройки питания от отеля (используем hotelChess.hotelId или текущий отель)
      const hotelInfo = await prisma.hotel.findUnique({
        where: { id: hotelChess.hotelId || currentHotelId },
        select: {
          breakfast: true,
          lunch: true,
          dinner: true,
          name: true
        }
      })

      if (hotelInfo) {
        const mealTimes = {
          breakfast: hotelInfo.breakfast,
          lunch: hotelInfo.lunch,
          dinner: hotelInfo.dinner
        }

        const calculatedMealPlan = calculateMeal(arrival, departure, mealTimes)
        mealPlanData = {
          included: true,
          breakfast: calculatedMealPlan.totalBreakfast,
          lunch: calculatedMealPlan.totalLunch,
          dinner: calculatedMealPlan.totalDinner,
          dailyMeals: calculatedMealPlan.dailyMeals
        }
      }
    }

    if (hotelChess.id) {
      // Обновление существующей записи HotelChess
      const previousHotelChessData = await prisma.hotelChess.findUnique({
        where: { id: hotelChess.id }
      })

      await prisma.hotelChess.update({
        where: { id: hotelChess.id },
        data: {
          public: hotelChess.public,
          room: hotelChess.room,
          place: hotelChess.place,
          start: hotelChess.start,
          end: hotelChess.end,
          clientId: hotelChess.clientId,
          requestId: hotelChess.requestId,
          reserveId: hotelChess.reserveId,
          status: hotelChess.status,
          mealPlan: mealPlanData
        }
      })

      // Если запись привязана к заявке
      if (hotelChess.requestId) {
        // Находим комнату по идентификатору (или по другому критерию, например, по имени)
        const room = await prisma.room.findUnique({
          where: { hotelId: hotelChess.hotelId, id: hotelChess.roomId }
        })

        const updatedRequest = await prisma.request.update({
          where: { id: hotelChess.requestId },
          data: {
            status: "transferred",
            hotel: { connect: { id: currentHotelId } },
            hotelChess: { connect: { id: hotelChess.id } },
            roomCategory: room?.category, // предполагаем, что комната найдена
            roomNumber: room?.name,
            mealPlan: mealPlanData
          }
        })

        await logAction({
          context,
          action: "update_hotel_chess",
          description: `Заявка № <span style='color:#545873'>${updatedRequest.requestNumber}</span> перенесена в номер <span style='color:#545873'>${hotelChess.room}</span> пользователем <span style='color:#545873'>${user.name}</span>`,
          oldData: previousHotelChessData,
          newData: hotelChess,
          hotelId: hotelChess.hotelId,
          requestId: updatedRequest.id
        })
        pubsub.publish(REQUEST_UPDATED, { requestUpdated: updatedRequest })
      } else if (hotelChess.reserveId) {
        // Если запись привязана к брони
        await prisma.reserve.update({
          where: { id: hotelChess.reserveId },
          data: {
            hotelChess: { connect: { id: hotelChess.id } },
            mealPlan: mealPlanData
          }
        })
        await logAction({
          context,
          action: "update_hotel_chess",
          description: `Бронь № <span style='color:#545873'>${hotelChess.reserveId}</span> перенесена в номер <span style='color:#545873'>${hotelChess.room}</span> пользователем <span style='color:#545873'>${user.name}</span>`,
          oldData: previousHotelChessData,
          newData: hotelChess,
          hotelId: hotelChess.hotelId,
          reserveId: hotelChess.reserveId
        })
      }
    } else {
      // Создание новой записи для HotelChess
      let newHotelChess
      if (hotelChess.reserveId) {
        const reserve = await prisma.reserve.findUnique({
          where: { id: hotelChess.reserveId },
          select: { reserveForPerson: true }
        })
        const reserveForPerson = reserve?.reserveForPerson
        if (reserveForPerson === true) {
          newHotelChess = await prisma.hotelChess.create({
            data: {
              hotel: { connect: { id: currentHotelId } },
              public: hotelChess.public,
              room: hotelChess.room,
              place: hotelChess.place,
              start: hotelChess.start,
              end: hotelChess.end,
              client: { connect: { id: hotelChess.clientId } },
              reserve: { connect: { id: hotelChess.reserveId } },
              status: hotelChess.status,
              mealPlan: mealPlanData
            }
          })
        } else if (reserveForPerson === false) {
          try {
            newHotelChess = await prisma.hotelChess.create({
              data: {
                hotel: { connect: { id: currentHotelId } },
                public: hotelChess.public,
                room: hotelChess.room,
                place: hotelChess.place,
                start: hotelChess.start,
                end: hotelChess.end,
                passenger: { connect: { id: hotelChess.clientId } },
                reserve: { connect: { id: hotelChess.reserveId } },
                status: hotelChess.status,
                mealPlan: mealPlanData
              }
            })
          } catch (e) {
            console.error("Error: ", e)
            throw new Error(
              "Ошибка при создании клиентского бронирования: " +
                e.message +
                "\n\n :" +
                e.stack
            )
          }
        }
      } else {
        newHotelChess = await prisma.hotelChess.create({
          data: {
            hotel: { connect: { id: currentHotelId } },
            public: hotelChess.public,
            room: hotelChess.room,
            place: hotelChess.place,
            start: hotelChess.start,
            end: hotelChess.end,
            client: { connect: { id: hotelChess.clientId } },
            request: hotelChess.requestId
              ? { connect: { id: hotelChess.requestId } }
              : undefined,
            status: hotelChess.status,
            mealPlan: mealPlanData
          }
        })
      }

      if (hotelChess.requestId) {
        // Обработка для новой заявки
        const room = await prisma.room.findUnique({
          where: { hotelId: hotelChess.hotelId, id: hotelChess.roomId }
        })
        const updatedRequest = await prisma.request.update({
          where: { id: hotelChess.requestId },
          data: {
            status: "done",
            hotel: { connect: { id: currentHotelId } },
            mealPlan: mealPlanData,
            roomCategory: room?.category,
            room: { connect: { id: room?.id } }
          },
          include: {
            hotel: true,
            person: true,
            hotelChess: true
          }
        })
        const oldChat = await prisma.chat.findFirst({
          where: {
            request: { id: updatedRequest.id },
            separator: "hotel"
          }
        })
        if (!oldChat) {
          const newChat = await prisma.chat.create({
            data: {
              request: { connect: { id: updatedRequest.id } },
              separator: "hotel"
            }
          })
          await prisma.chatUser.create({
            data: {
              chat: { connect: { id: newChat.id } },
              user: { connect: { id: user.id } }
            }
          })
        }
        await logAction({
          context,
          action: "update_hotel_chess",
          description: `<span style='color:#545873'>${
            updatedRequest.person.name
          }</span> был размещён в отеле <span style='color:#545873'>${
            hotel?.name || ""
          }</span> в номер ${
            hotelChess.room
          } по заявке № <span style='color:#545873'>${
            updatedRequest.requestNumber
          }</span> пользователем <span style='color:#545873'>${
            user.name
          }</span>`,
          oldData: null,
          newData: newHotelChess,
          hotelId: hotelChess.hotelId,
          requestId: hotelChess.requestId,
          reserveId: hotelChess.reserveId
        })
        pubsub.publish(REQUEST_UPDATED, {
          requestUpdated: updatedRequest
        })
      }
      // else if (hotelChess.reserveId) {
      //   // Обработка для новой брони (reserve)
      //   await prisma.reserve.update({
      //     where: { id: hotelChess.reserveId },
      //     data: {
      //       hotelChess: { connect: { id: newHotelChess.id } },
      //       mealPlan: mealPlanData
      //     }
      //   });
      //   await logAction({
      //     context,
      //     action: "update_hotel_chess",
      //     description: `Бронь № ${hotelChess.reserveId} была создана пользователем ${user.name}`,
      //     oldData: null,
      //     newData: newHotelChess,
      //     hotelId: hotelChess.hotelId
      //   });
      // }
    }
  }
}

//----------------------------------------------------------------------------------------------------------------------------------------------------------------

if (hotelChesses) {
  for (const hotelChess of hotelChesses) {

    if (hotelChess.id) {
      const previousHotelChessData = await prisma.hotelChess.findUnique({
        where: { id: hotelChess.id }
      })

      // Обновление существующей записи
      await prisma.hotelChess.update({
        where: { id: hotelChess.id },
        data: {
          public: hotelChess.public,
          room: hotelChess.room,
          place: hotelChess.place,
          start: hotelChess.start,
          end: hotelChess.end,
          clientId: hotelChess.clientId,
          requestId: hotelChess.requestId,
          reserveId: hotelChess.reserveId
        }
      })

      if (hotelChess.requestId) {
        // Обработка для заявки типа "request"
        const room = await prisma.room.findFirst({
          where: { hotelId: hotelChess.hotelId, name: hotelChess.room }
        })

        const updatedRequest = await prisma.request.update({
          where: { id: hotelChess.requestId },
          data: {
            status: "transferred",
            hotel: { connect: { id: id } },
            hotelChess: { connect: { id: hotelChess.id } },
            roomCategory: room.category,
            roomNumber: room.name
          }
        })

        await logAction({
          context,
          action: "update_hotel_chess",
          description: `Заявка № <span style='color:#545873'>${updatedRequest.requestNumber}</span> была перенесена в номер <span style='color:#545873'>${hotelChess.room}</span> пользователем <span style='color:#545873'>${user.name}</span>`,
          oldData: previousHotelChessData,
          newData: hotelChess,
          hotelId: hotelChess.hotelId
        })

        pubsub.publish(REQUEST_UPDATED, {
          requestUpdated: updatedRequest
        })
      } else if (hotelChess.reserveId) {
        // Обработка для заявки типа "reserve"
        await prisma.reserve.update({
          where: { id: hotelChess.reserveId },
          data: {
            status: "transferred",
            hotelChess: { connect: { id: hotelChess.id } }
          }
        })

        await logAction({
          context,
          action: "update_hotel_chess",
          description: `Бронь № <span style='color:#545873'>${hotelChess.reserveId}</span> была обновлена пользователем <span style='color:#545873'>${user.name}</span>`,
          oldData: previousHotelChessData,
          newData: hotelChess,
          hotelId: hotelChess.hotelId
        })
      }
    } else {
      // Создание новой записи
      const newHotelChess = await prisma.hotelChess.create({
        data: {
          hotel: { connect: { id: id } },
          public: hotelChess.public,
          room: hotelChess.room,
          place: hotelChess.place,
          start: hotelChess.start,
          end: hotelChess.end,
          client: { connect: { id: hotelChess.clientId } },
          request: hotelChess.requestId
            ? { connect: { id: hotelChess.requestId } }
            : undefined,
          reserve: hotelChess.reserveId
            ? { connect: { id: hotelChess.reserveId } }
            : undefined
        }
      })

      if (hotelChess.requestId) {
        // Обработка для новой заявки типа "request"
        const room = await prisma.room.findFirst({
          where: { hotelId: hotelChess.hotelId, name: hotelChess.room }
        })
        const arrival = `${hotelChess.start}`
        const departure = `${hotelChess.end}`
        const hotel = await prisma.hotel.findUnique({
          where: { id },
          select: { breakfast: true, lunch: true, dinner: true }
        })
        const mealTimes = {
          breakfast: hotel.breakfast,
          lunch: hotel.lunch,
          dinner: hotel.dinner
        }
        const mealPlan = calculateMeal(arrival, departure, mealTimes)

        const updatedRequest = await prisma.request.update({
          where: { id: hotelChess.requestId },
          data: {
            status: "done",
            hotel: { connect: { id } },
            mealPlan: {
              included: true,
              breakfast: mealPlan.totalBreakfast,
              lunch: mealPlan.totalLunch,
              dinner: mealPlan.totalDinner,
              dailyMeals: mealPlan.dailyMeals
            },
            roomCategory: room.category,
            roomNumber: room.name
          },
          include: {
            // airline: true,
            // airport: true,
            hotel: true,
            person: true,
            hotelChess: true
            // logs: true
          }
        })

        await logAction({
          context,
          action: "update_hotel_chess",
          description: `<span style='color:#545873'>${updatedRequest.person.name}</span> был размещён в отеле <span style='color:#545873'>${hotel.name}</span> в номер <span style='color:#545873'>${hotelChess.room}</span> по заявке № <span style='color:#545873'>${updatedRequest.requestNumber}</span> пользователем <span style='color:#545873'>${user.name}</span>`,
          oldData: null,
          newData: newHotelChess,
          hotelId: hotelChess.hotelId,
          requestId: hotelChess.requestId
        })

        pubsub.publish(REQUEST_UPDATED, {
          requestUpdated: updatedRequest
        })
      } else if (hotelChess.reserveId) {
        // Обработка для новой заявки типа "reserve"
        await prisma.reserve.update({
          where: { id: hotelChess.reserveId },
          data: {
            status: "done",
            hotelChess: { connect: { id: newHotelChess.id } }
          }
        })

        await logAction({
          context,
          action: "update_hotel_chess",
          description: `Бронь № <span style='color:#545873'>${hotelChess.reserveId}</span> была создана пользователем <span style='color:#545873'>${user.name}</span>`,
          oldData: null,
          newData: newHotelChess,
          hotelId: hotelChess.hotelId
        })
      }
    }
  }
}
