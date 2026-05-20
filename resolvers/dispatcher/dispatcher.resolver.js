import { prisma } from "../../prisma.js"
import {
  pubsub,
  COMPANY_CHANGED,
  PRICECATEGORY_CHANGED,
  NOTIFICATION,
  DISPATCHER_DEPARTMENT_CREATED,
  DISPATCHER_DEPARTMENT_UPDATED
} from "../../services/infra/pubsub.js"
import { subscriptionAuthMiddleware } from "../../services/infra/subscriptionAuth.js"
import { withFilter } from "graphql-subscriptions"
import {
  allMiddleware,
  superAdminMiddleware,
  dispatcherOrSuperAdminMiddleware,
  airlineAdminMiddleware
} from "../../middlewares/authMiddleware.js"
import { GraphQLError } from "graphql"
import {
  AIRLINE_POSITION_SEPARATORS,
  assertPositionAccess,
  isAirlinePosition,
  resolveAirlineId
} from "../../services/position/positionAccess.js"
import {
  AllowedSiteNotification,
  getDisabledActionsFromMenu,
  getNotificationMenuForUser
} from "../../services/notification/notificationMenuCheck.js"

/** Actions stored on Notification.description for transfer domain (no request/reserve/passengerRequest id on row). */
const TRANSFER_NOTIFICATION_ACTIONS = [
  "transfer_message",
  "create_transfer",
  "update_transfer"
]

const dispatcherResolver = {
  Query: {
    getAllCompany: async (_, {}, context) => {
      await allMiddleware(context) // MIDDLEWARE_REVIEW: allMiddleware

      return await prisma.company.findMany({
        include: {
          priceCategory: true
        }
      })
    },
    getCompany: async (_, { id }, context) => {
      await allMiddleware(context) // MIDDLEWARE_REVIEW: allMiddleware

      const company = await prisma.company.findUnique({
        where: { id },
        include: {
          priceCategory: true
        }
      })

      if (!company) {
        throw new GraphQLError("Компания не найдена", {
          extensions: { code: "NOT_FOUND" }
        })
      }

      return company
    },
    // getAllPriceCategory: async (_, {}, context) => {
    //   await allMiddleware(context) // MIDDLEWARE_REVIEW: allMiddleware
    //   return await prisma.priceCategory.findMany({
    //     include: {
    //       airline: true,
    //       hotel: true,
    //       company: true,
    //       airlinePrices: true
    //     }
    //   })
    // },
    getAllPriceCategory: async (_, { filter }, context) => {
      await allMiddleware(context) // MIDDLEWARE_REVIEW: allMiddleware

      const { companyId, airlineId, hotelId } = filter || {}

      const where = {
        ...(companyId && { companyId }),
        ...(airlineId && { airlineId }),
        ...(hotelId && { hotelId })
      }

      return await prisma.priceCategory.findMany({
        where,
        include: {
          airline: true,
          hotel: true,
          company: true,
          airlinePrices: true
        }
      })
    },
    getPriceCategory: async (_, { id }, context) => {
      await allMiddleware(context) // MIDDLEWARE_REVIEW: allMiddleware
      return await prisma.priceCategory.findUnique({
        where: { id },
        include: {
          airline: true,
          hotel: true,
          company: true,
          airlinePrices: true
        }
      })
    },
    getAllNotifications: async (_, { pagination }, context) => {
      await allMiddleware(context) // MIDDLEWARE_REVIEW: allMiddleware
      const { user } = context
      const p = pagination || {}
      const {
        skip: skipRaw,
        take: takeRaw,
        type,
        status,
        actions,
        read: readFilter
      } = p
      const skip = skipRaw ?? 0
      const take = takeRaw ?? 10

      let filter = {}
      if (user.dispatcher === true) {
        filter = {}
      }
      if (user.airlineId) {
        filter = { airlineId: user.airlineId }
      }
      if (user.hotelId) {
        filter = { hotelId: user.hotelId }
      }

      if (type === "request") {
        filter.requestId = { not: null }
      } else if (type === "reserve") {
        filter.reserveId = { not: null }
      } else if (type === "passengerRequest") {
        filter.passengerRequestId = { not: null }
      } else if (type === "transfer") {
        let transferActionList = TRANSFER_NOTIFICATION_ACTIONS
        if (actions?.length) {
          const allowed = new Set(actions)
          transferActionList = TRANSFER_NOTIFICATION_ACTIONS.filter((a) =>
            allowed.has(a)
          )
        }
        if (transferActionList.length === 0) {
          return { totalPages: 0, totalCount: 0, notifications: [] }
        }
        filter.description = {
          is: { action: { in: transferActionList } }
        }
      }

      const needsMenuCheck =
        user.role !== "SUPERADMIN" &&
        (user.dispatcher === true ||
          (user.airlineId && user.airlineDepartmentId))

      let menuActionFilter = {}
      if (needsMenuCheck) {
        const menu = await getNotificationMenuForUser(user)
        const disabledActions = getDisabledActionsFromMenu(menu)
        if (disabledActions.length > 0) {
          menuActionFilter = {
            NOT: { description: { is: { action: { in: disabledActions } } } }
          }
        }
      }

      const extraAnd = []
      if (status?.length) {
        if (type === "request") {
          extraAnd.push({ request: { is: { status: { in: status } } } })
        } else if (type === "reserve") {
          extraAnd.push({ reserve: { is: { status: { in: status } } } })
        } else if (type === "passengerRequest") {
          extraAnd.push({
            passengerRequest: { is: { status: { in: status } } }
          })
        }
      }

      if (actions?.length && type !== "transfer") {
        extraAnd.push({
          description: { is: { action: { in: actions } } }
        })
      }

      if (readFilter === true && user?.id) {
        extraAnd.push({ readBy: { some: { userId: user.id } } })
      } else if (readFilter === false && user?.id) {
        extraAnd.push({ readBy: { none: { userId: user.id } } })
      }

      const whereParts = [filter, menuActionFilter, ...extraAnd].filter(
        (part) => part && Object.keys(part).length > 0
      )
      const where =
        whereParts.length === 1 ? whereParts[0] : { AND: whereParts }

      const totalCount = await prisma.notification.count({ where })

      const totalPages = Math.ceil(totalCount / take)

      const notifications = await prisma.notification.findMany({
        where,
        skip: skip * take,
        take: take,
        orderBy: { createdAt: "desc" },
        include: {
          request: true,
          reserve: true,
          passengerRequest: {
            include: {
              airline: true,
              airport: true,
              createdBy: true
            }
          }
        }
      })
      return { totalPages, totalCount, notifications }
    },
    getAllPositions: async (_, {}, context) => {
      await allMiddleware(context) // MIDDLEWARE_REVIEW: allMiddleware
      return await prisma.position.findMany({})
    },
    getAirlinePositions: async (_, {}, context) => {
      await airlineAdminMiddleware(context)
      return await prisma.position.findMany({
        where: { separator: "airline" },
        orderBy: { name: "asc" }
      })
    },
    getAirlineUserPositions: async (_, { airlineId }, context) => {
      await airlineAdminMiddleware(context)
      return await prisma.position.findMany({
        where: { separator: "airlineUser", airlineId },
        orderBy: { name: "asc" }
      })
    },
    getHotelPositions: async (_, {}, context) => {
      await allMiddleware(context) // MIDDLEWARE_REVIEW: allMiddleware
      return await prisma.position.findMany({ where: { separator: "hotel" } })
    },
    getDispatcherPositions: async (_, {}, context) => {
      await allMiddleware(context) // MIDDLEWARE_REVIEW: allMiddleware
      return await prisma.position.findMany({
        where: { separator: "dispatcher" }
      })
    },
    getTransferDispatcherPositions: async (_, {}, context) => {
      await allMiddleware(context) // MIDDLEWARE_REVIEW: allMiddleware
      return await prisma.position.findMany({
        where: { separator: "dispatcher", category: "transfer" }
      })
    },
    getPosition: async (_, { id }, context) => {
      const position = await prisma.position.findUnique({ where: { id } })
      if (!position) {
        return null
      }
      if (isAirlinePosition(position)) {
        await airlineAdminMiddleware(context)
        assertPositionAccess(context, position)
      } else {
        await allMiddleware(context)
      }
      return position
    },
    dispatcherDepartments: async (_, { pagination }, context) => {
      await dispatcherOrSuperAdminMiddleware(context)
      const { skip, take, all } = pagination || {}
      const totalCount = await prisma.dispatcherDepartment.count({
        where: { active: true }
      })
      const departments = all
        ? await prisma.dispatcherDepartment.findMany({
            where: { active: true },
            include: {
              dispatchers: true
            },
            orderBy: { name: "asc" }
          })
        : await prisma.dispatcherDepartment.findMany({
            where: { active: true },
            skip: skip ? skip * take : undefined,
            take: take || undefined,
            include: {
              dispatchers: true
            },
            orderBy: { name: "asc" }
          })
      const totalPages = take && !all ? Math.ceil(totalCount / take) : 1
      return { departments, totalCount, totalPages }
    },
    dispatcherDepartment: async (_, { id }, context) => {
      await dispatcherOrSuperAdminMiddleware(context)
      return await prisma.dispatcherDepartment.findUnique({
        where: { id },
        include: {
          dispatchers: true
        }
      })
    }
  },
  Mutation: {
    createCompany: async (_, { input }, context) => {
      await allMiddleware(context) // MIDDLEWARE_REVIEW: allMiddleware
      const company = await prisma.company.create({
        data: { ...input }
      })
      pubsub.publish(COMPANY_CHANGED, {
        companyChanged: company
      })
      return company
    },
    updateCompany: async (_, { input }, context) => {
      await allMiddleware(context) // MIDDLEWARE_REVIEW: allMiddleware
      const { id, ...data } = input // Убираем id из data
      const company = await prisma.company.update({
        where: { id },
        data: { ...data } // Передаём только те данные, которые нужно обновить
      })
      pubsub.publish(COMPANY_CHANGED, {
        companyChanged: company
      })
      return company
    },
    createPriceCategory: async (_, { input }, context) => {
      await allMiddleware(context) // MIDDLEWARE_REVIEW: allMiddleware

      const data = {
        airlineId: input.airlineId || undefined,
        hotelId: input.hotelId || undefined,
        companyId: input.companyId || undefined,
        name: input.name,

        ...(input.airlinePrices?.length
          ? {
              airlinePrices: {
                connect: input.airlinePrices.map((id) => ({ id }))
              }
            }
          : {})
      }

      const priceCategory = await prisma.priceCategory.create({
        data,
        include: {
          airline: true,
          hotel: true,
          company: true,
          airlinePrices: true
        }
      })

      pubsub.publish(PRICECATEGORY_CHANGED, {
        priceCategoryChanged: priceCategory
      })

      return priceCategory
    },
    updatePriceCategory: async (_, { input }, context) => {
      await allMiddleware(context) // MIDDLEWARE_REVIEW: allMiddleware

      const { id, airlineId, hotelId, companyId, name, airlinePrices } = input

      // Формируем объект `data` динамически
      const data = {
        ...(airlineId !== undefined && { airlineId }),
        ...(hotelId !== undefined && { hotelId }),
        ...(companyId !== undefined && { companyId }),
        ...(name !== undefined && { name }),

        // Обработка airlinePrices
        ...(airlinePrices !== undefined && {
          airlinePrices: airlinePrices.length
            ? {
                connect: airlinePrices.map((id) => ({ id })) // подключаем новые
              }
            : {} // Если массив пустой, не обновляем старые связи
        })
      }

      // Если airlinePrices не передан, удаляем это поле из update
      if (airlinePrices === undefined) {
        delete data.airlinePrices
      }

      const priceCategory = await prisma.priceCategory.update({
        where: { id },
        data,
        include: {
          airline: true,
          hotel: true,
          company: true,
          airlinePrices: true
        }
      })

      pubsub.publish(PRICECATEGORY_CHANGED, {
        priceCategoryChanged: priceCategory
      })

      return priceCategory
    },
    deletePriceCategory: async (_, { id }, context) => {
      await allMiddleware(context) // MIDDLEWARE_REVIEW: allMiddleware

      const priceCategory = await prisma.priceCategory.findUnique({
        where: { id },
        include: {
          airline: true,
          hotel: true,
          company: true,
          airlinePrices: true
        }
      })

      if (!priceCategory) {
        return false
      }

      await prisma.$transaction([
        prisma.airlinePrice.updateMany({
          where: { airlinePriceCategoryId: id },
          data: { airlinePriceCategoryId: null }
        }),
        prisma.priceCategory.delete({
          where: { id }
        })
      ])

      pubsub.publish(PRICECATEGORY_CHANGED, {
        priceCategoryChanged: priceCategory
      })

      return true
    },
    createPosition: async (_, { input }, context) => {
      const { name, separator, category, airlineId } = input

      if (!separator) {
        throw new GraphQLError("separator обязателен", {
          extensions: { code: "BAD_USER_INPUT" }
        })
      }

      const isAirline = AIRLINE_POSITION_SEPARATORS.includes(separator)

      if (isAirline) {
        await airlineAdminMiddleware(context)
        const resolvedAirlineId = resolveAirlineId(context, airlineId)
        return await prisma.position.create({
          data: {
            name,
            separator,
            category,
            airlineId: resolvedAirlineId
          }
        })
      }

      await allMiddleware(context)
      return await prisma.position.create({
        data: {
          name,
          separator,
          category
        }
      })
    },
    updatePosition: async (_, { input }, context) => {
      const { id, name, category } = input
      if (!id) {
        throw new GraphQLError("id обязателен для обновления должности", {
          extensions: { code: "BAD_USER_INPUT" }
        })
      }

      const existing = await prisma.position.findUnique({ where: { id } })
      if (!existing) {
        throw new GraphQLError("Должность не найдена", {
          extensions: { code: "NOT_FOUND" }
        })
      }

      if (isAirlinePosition(existing)) {
        await airlineAdminMiddleware(context)
        assertPositionAccess(context, existing)
      } else {
        await allMiddleware(context)
      }

      const data = {}
      if (name !== undefined) data.name = name
      if (category !== undefined) data.category = category

      return await prisma.position.update({
        where: { id },
        data
      })
    },
    deletePosition: async (_, { id }, context) => {
      const existing = await prisma.position.findUnique({ where: { id } })
      if (!existing) {
        throw new GraphQLError("Должность не найдена", {
          extensions: { code: "NOT_FOUND" }
        })
      }

      if (isAirlinePosition(existing)) {
        await airlineAdminMiddleware(context)
        assertPositionAccess(context, existing)
      } else {
        await allMiddleware(context)
      }

      const [usersCount, staffCount, deptLinksCount] = await Promise.all([
        prisma.user.count({ where: { positionId: id } }),
        prisma.airlinePersonal.count({ where: { positionId: id } }),
        prisma.positionOnDepartment.count({ where: { positionId: id } })
      ])

      if (usersCount + staffCount + deptLinksCount > 0) {
        throw new GraphQLError(
          "Невозможно удалить должность: она используется пользователями, сотрудниками или отделами",
          { extensions: { code: "POSITION_IN_USE" } }
        )
      }

      return await prisma.position.delete({ where: { id } })
    },
    createDispatcherDepartment: async (_, { input }, context) => {
      await dispatcherOrSuperAdminMiddleware(context)
      const { dispatcherIds, ...restInput } = input

      // Проверяем, что все пользователи являются диспетчерами или суперадминами
      if (dispatcherIds && dispatcherIds.length > 0) {
        const users = await prisma.user.findMany({
          where: {
            id: { in: dispatcherIds }
          },
          select: {
            id: true,
            dispatcher: true,
            role: true
          }
        })

        const invalidUsers = users.filter(
          (user) => user.role !== "SUPERADMIN" && user.dispatcher !== true
        )

        if (invalidUsers.length > 0) {
          throw new GraphQLError(
            `Пользователи с ID ${invalidUsers.map((u) => u.id).join(", ")} не являются диспетчерами или суперадминами`,
            {
              extensions: { code: "FORBIDDEN" }
            }
          )
        }
      }

      const department = await prisma.dispatcherDepartment.create({
        data: {
          ...restInput,
          dispatchers: dispatcherIds
            ? {
                connect: dispatcherIds.map((id) => ({ id }))
              }
            : undefined
        },
        include: {
          dispatchers: true
        }
      })

      pubsub.publish(DISPATCHER_DEPARTMENT_CREATED, {
        dispatcherDepartmentCreated: department
      })

      return department
    },
    updateDispatcherDepartment: async (_, { id, input }, context) => {
      await dispatcherOrSuperAdminMiddleware(context)
      const { dispatcherIds, ...restInput } = input

      // Проверяем, что все пользователи являются диспетчерами или суперадминами
      if (dispatcherIds && dispatcherIds.length > 0) {
        const users = await prisma.user.findMany({
          where: {
            id: { in: dispatcherIds }
          },
          select: {
            id: true,
            dispatcher: true,
            role: true
          }
        })

        const invalidUsers = users.filter(
          (user) => user.role !== "SUPERADMIN" && user.dispatcher !== true
        )

        if (invalidUsers.length > 0) {
          throw new GraphQLError(
            `Пользователи с ID ${invalidUsers.map((u) => u.id).join(", ")} не являются диспетчерами или суперадминами`,
            {
              extensions: { code: "FORBIDDEN" }
            }
          )
        }
      }

      const updateData = {
        ...restInput
      }

      if (dispatcherIds !== undefined) {
        // Получаем текущих диспетчеров отдела
        const currentDepartment = await prisma.dispatcherDepartment.findUnique({
          where: { id },
          select: {
            dispatchers: {
              select: { id: true }
            }
          }
        })

        const currentIds = currentDepartment?.dispatchers.map((d) => d.id) || []
        const newIds = dispatcherIds

        // Вычисляем какие id нужно добавить, а какие убрать
        const toConnect = newIds.filter((id) => !currentIds.includes(id))
        const toDisconnect = currentIds.filter((id) => !newIds.includes(id))

        updateData.dispatchers = {
          connect: toConnect.map((userId) => ({ id: userId })),
          disconnect: toDisconnect.map((userId) => ({ id: userId }))
        }
      }

      const department = await prisma.dispatcherDepartment.update({
        where: { id },
        data: updateData,
        include: {
          dispatchers: true
        }
      })

      pubsub.publish(DISPATCHER_DEPARTMENT_UPDATED, {
        dispatcherDepartmentUpdated: department
      })

      return department
    },
    deleteDispatcherDepartment: async (_, { id }, context) => {
      await dispatcherOrSuperAdminMiddleware(context)

      await prisma.user.updateMany({
        where: { dispatcherDepartmentId: id },
        data: { dispatcherDepartmentId: null }
      })

      const department = await prisma.dispatcherDepartment.update({
        where: { id },
        data: { active: false },
        include: {
          dispatchers: true
        }
      })

      pubsub.publish(DISPATCHER_DEPARTMENT_UPDATED, {
        dispatcherDepartmentUpdated: department
      })

      return department
    }
    // allDataUpdate: async (_, {}, context) => {
    //   await superAdminMiddleware(context)
    //   await prisma.airline.updateMany({
    //     data: { active: true }
    //   })
    //   await prisma.hotel.updateMany({
    //     data: { active: true }
    //   })
    //   await prisma.user.updateMany({
    //     data: { active: true }
    //   })
    //   await prisma.airlinePersonal.updateMany({
    //     data: { active: true }
    //   })
    //   await prisma.airlineDepartment.updateMany({
    //     data: { active: true }
    //   })
    // }
  },
  Subscription: {
    notification: {
      subscribe: withFilter(
        () => pubsub.asyncIterator([NOTIFICATION]),
        async (payload, variables, context) => {
          try {
            await allMiddleware(context) // MIDDLEWARE_REVIEW: allMiddleware
          } catch {
            return false
          }
          const { subject, subjectType } = context

          if (!subject || subjectType !== "USER") return false

          const notification = payload.notification
          const action = notification?.action

          // SUPERADMIN видит все уведомления без фильтрации
          if (subject.role === "SUPERADMIN") return true

          // Проверка NotificationMenu: диспетчеры и пользователи авиакомпании с отделом
          const needsMenuCheck =
            (subject.dispatcher && subject.id) ||
            (notification.airlineId &&
              subject.airlineId === notification.airlineId &&
              subject.airlineDepartmentId &&
              subject.id)

          if (needsMenuCheck && action) {
            const allowed = await AllowedSiteNotification(subject, action)
            if (!allowed) return false
          }

          // Диспетчеры (после проверки меню) видят все
          if (subject.dispatcher === true) return true

          // Проверяем права на уведомление через связанные сущности (отель/авиакомпания)
          if (
            notification.airlineId &&
            subject.airlineId === notification.airlineId
          ) {
            return true
          }
          if (
            notification.hotelId &&
            subject.hotelId === notification.hotelId
          ) {
            return true
          }

          return false
        }
      )
    },
    companyChanged: {
      subscribe: withFilter(
        () => pubsub.asyncIterator([COMPANY_CHANGED]),
        async (payload, variables, context) => {
          try {
            await allMiddleware(context) // MIDDLEWARE_REVIEW: allMiddleware
          } catch {
            return false
          }
          const { subject, subjectType } = context

          if (!subject || subjectType !== "USER") return false

          // Только SUPERADMIN и диспетчеры видят изменения компаний
          return subject.role === "SUPERADMIN" || subject.dispatcher === true
        }
      )
    },
    priceCategoryChanged: {
      subscribe: withFilter(
        () => pubsub.asyncIterator([PRICECATEGORY_CHANGED]),
        async (payload, variables, context) => {
          try {
            await allMiddleware(context) // MIDDLEWARE_REVIEW: allMiddleware
          } catch {
            return false
          }
          const { subject, subjectType } = context

          if (!subject || subjectType !== "USER") return false

          // SUPERADMIN и диспетчеры видят все изменения
          if (subject.role === "SUPERADMIN" || subject.dispatcher === true) {
            return true
          }

          // Пользователи видят изменения для своих авиакомпаний/отелей
          const priceCategory = payload.priceCategoryChanged
          if (
            subject.airlineId &&
            priceCategory.airlineId === subject.airlineId
          ) {
            return true
          }
          if (subject.hotelId && priceCategory.hotelId === subject.hotelId) {
            return true
          }

          return false
        }
      )
    },
    dispatcherDepartmentCreated: {
      subscribe: withFilter(
        () => pubsub.asyncIterator([DISPATCHER_DEPARTMENT_CREATED]),
        async (payload, variables, context) => {
          try {
            await allMiddleware(context) // MIDDLEWARE_REVIEW: allMiddleware
          } catch {
            return false
          }
          const { subject, subjectType } = context

          if (!subject || subjectType !== "USER") return false

          // Только SUPERADMIN и диспетчеры видят создание отделов
          return subject.role === "SUPERADMIN" || subject.dispatcher === true
        }
      )
    },
    dispatcherDepartmentUpdated: {
      subscribe: withFilter(
        () => pubsub.asyncIterator([DISPATCHER_DEPARTMENT_UPDATED]),
        async (payload, variables, context) => {
          try {
            await allMiddleware(context) // MIDDLEWARE_REVIEW: allMiddleware
          } catch {
            return false
          }
          const { subject, subjectType } = context

          if (!subject || subjectType !== "USER") return false

          // Только SUPERADMIN и диспетчеры видят обновление отделов
          return subject.role === "SUPERADMIN" || subject.dispatcher === true
        }
      )
    }
  },
  PriceCategory: {
    airlinePrices: async (parent) => {
      return await prisma.airlinePrice.findMany({
        where: { airlinePriceCategoryId: parent.id },
        include: {
          airports: {
            include: { airport: true }
          }
        }
      })
    }
  }
}

export default dispatcherResolver
