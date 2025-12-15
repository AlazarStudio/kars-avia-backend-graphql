import { prisma } from "../../prisma.js"
import {
  pubsub,
  TRANSFER_CREATED,
  TRANSFER_UPDATED
} from "../../services/infra/pubsub.js"
import { printIntrospectionSchema, subscribe } from "graphql"
import { dateFormatter } from "../../services/format/dateTimeFormatterVersion2.js"

const DATE_FIELDS = [
  "scheduledPickupAt",
  "driverAssignmentAt",
  "orderAcceptanceAt",
  "arrivedToPassengerAt",
  "departedAt",
  "arrivedAt",
  "finishedAt",
  "createdAt",
  "updatedAt"
]

const transferResolver = {
  Query: {
    transfers: async (_, { pagination }, context) => {
      const {
        skip,
        take,
        all,
        driverId,
        personId,
        dispatcherId,
        organizationId,
        airlineId
      } = pagination

      let whereInput = {}

      if (driverId != undefined) {
        whereInput.driverId = driverId
      }
      if (personId != undefined) {
        whereInput.personId = personId
      }
      if (dispatcherId != undefined) {
        whereInput.dispatcherId = dispatcherId
      }
      if (organizationId != undefined) {
        whereInput.organizationId = organizationId
      }
      if (airlineId != undefined) {
        whereInput.airlineId = airlineId
      }

      const transfers = all
        ? await prisma.transfer.findMany({
            where: whereInput
          }) // добавить позже фильтрацию
        : await prisma.transfer.findMany({
            where: whereInput,
            skip: skip,
            take: take
          })

      const totalCount = await prisma.transfer.count({ where: whereInput })

      return { transfers, totalCount }
    },
    transfer: async (_, { id }) => {
      const transfer = await prisma.transfer.findUnique({
        // Находим transfer по id
        where: { id: id },
        include: { driver: true, persons: true }
      })

      const moscowDate = {}
      // moscowDate["scheduledPickupAt"] = dateFormatter(
      //   transfer["scheduledPickupAt"]
      // )
      // moscowDate["driverAssignmentAt"] = dateFormatter(
      //   transfer["driverAssignmentAt"]
      // )
      // moscowDate["orderAcceptanceAt"] = dateFormatter(
      //   transfer["orderAcceptanceAt"]
      // )
      // moscowDate["arrivedToPassengerAt"] = dateFormatter(
      //   transfer["arrivedToPassengerAt"]
      // )
      // moscowDate["departedAt"] = dateFormatter(transfer["departedAt"])
      // moscowDate["arrivedAt"] = dateFormatter(transfer["arrivedAt"])
      // moscowDate["finishedAt"] = dateFormatter(transfer["finishedAt"])
      // moscowDate["createdAt"] = dateFormatter(transfer["createdAt"])
      // moscowDate["updatedAt"] = dateFormatter(transfer["updatedAt"])

      const dateKeys = [
        "scheduledPickupAt",
        "driverAssignmentAt",
        "orderAcceptanceAt",
        "arrivedToPassengerAt",
        "departedAt",
        "arrivedAt",
        "finishedAt",
        "createdAt",
        "updatedAt"
      ]

      for (let key in transfer) {
        if (dateKeys.includes(key)) {
          moscowDate[key] = dateFormatter(transfer[key])
        }
      }

      // Object.assign(transfer, moscowDate)
      return transfer
    }
  },
  Mutation: {
    createTransfer: async (_, { input }, context) => {
      const {
        dispatcherId,
        driverId,
        personsId,
        airlineId: inputAirlineId,
        ...restInput
      } = input

      const dateFields = [
        "scheduledPickupAt",
        "driverAssignmentAt",
        "orderAcceptanceAt",
        "arrivedToPassengerAt",
        "departedAt",
        "arrivedAt",
        "finishedAt",
        "createdAt",
        "updatedAt"
      ]

      const data = {}

      const ctxAirlineId = context.user?.airlineId || null
      let finalAirlineId = ctxAirlineId || inputAirlineId || null

      if (ctxAirlineId && inputAirlineId && ctxAirlineId !== inputAirlineId) {
        throw new Error("Forbidden: airlineId mismatch with current user")
      }

      if (!finalAirlineId) {
        throw new Error("airlineId is required")
      }

      for (let key in restInput) {
        if (restInput[key] === undefined || restInput[key] === null) continue

        if (dateFields.includes(key)) {
          data[key] = new Date(restInput[key])
        } else {
          data[key] = restInput[key]
        }
      }

      // связи dispatcher/driver
      if (dispatcherId) {
        data.dispatcher = { connect: { id: dispatcherId } }
      }
      if (driverId) {
        data.driver = { connect: { id: driverId } }
      }

      data.airline = { connect: { id: finalAirlineId } }

      // ПАССАЖИРЫ: personsId -> persons.create(...)
      if (Array.isArray(personsId) && personsId.length) {
        data.persons = {
          create: personsId.map((personalId) => ({
            personal: { connect: { id: personalId } } // TransferPassenger.personalId
          }))
        }
      }

      console.log("persons create " + JSON.stringify(data.persons))

      const newTransfer = await prisma.transfer.create({
        data
        // если нужно сразу вернуть связанные сущности:
        // include: { driver: true, dispatcher: true, persons: { include: { personal: true } } }
      })

      // const moscowDate = {}
      // moscowDate["scheduledPickupAt"] = dateFormatter(
      //   newTransfer["scheduledPickupAt"]
      // )
      // moscowDate["driverAssignmentAt"] = dateFormatter(
      //   newTransfer["driverAssignmentAt"]
      // )
      // moscowDate["orderAcceptanceAt"] = dateFormatter(
      //   newTransfer["orderAcceptanceAt"]
      // )
      // moscowDate["arrivedToPassengerAt"] = dateFormatter(
      //   newTransfer["arrivedToPassengerAt"]
      // )
      // moscowDate["departedAt"] = dateFormatter(newTransfer["departedAt"])
      // moscowDate["arrivedAt"] = dateFormatter(newTransfer["arrivedAt"])
      // moscowDate["finishedAt"] = dateFormatter(newTransfer["finishedAt"])
      // moscowDate["createdAt"] = dateFormatter(newTransfer["createdAt"])
      // moscowDate["updatedAt"] = dateFormatter(newTransfer["updatedAt"])

      // Object.assign(newTransfer, moscowDate)

      pubsub.publish(TRANSFER_CREATED, { transferCreated: newTransfer })

      return newTransfer
    },
    updateTransfer: async (_, { id, input }) => {
      const existing = await prisma.transfer.findUnique({ where: { id } })
      if (!existing) {
        throw new Error(`Transfer с id ${id} не найден`)
      }

      const { dispatcherId, driverId, personsId, ...restInput } = input

      const data = {}

      // скаляры + даты
      for (const key in restInput) {
        const value = restInput[key]
        if (value === undefined) continue // не трогаем поле

        if (DATE_FIELDS.includes(key)) {
          data[key] = value === null ? null : new Date(value) // null = очистить дату
        } else {
          data[key] = value
        }
      }

      // связь с диспетчером
      if (dispatcherId !== undefined) {
        data.dispatcher =
          dispatcherId === null
            ? { disconnect: true } // убрать диспетчера
            : { connect: { id: dispatcherId } }
      }

      // связь с водителем
      if (driverId !== undefined) {
        data.driver =
          driverId === null
            ? { disconnect: true } // убрать водителя
            : { connect: { id: driverId } }
      }

      // ПАССАЖИРЫ: пример, если хочешь полностью заменить список
      if (Array.isArray(personsId) && personsId.length) {
        data.persons = {
          create: personsId.map((personalId) => ({
            personal: { connect: { id: personalId } } // TransferPassenger.personalId
          }))
        }
      }

      console.log("persons update " + JSON.stringify(data.persons))

      const updatedTransfer = await prisma.transfer.update({
        where: { id }, // если id числовой — Number(id)
        data
      })

      pubsub.publish(TRANSFER_UPDATED, { transferUpdated: updatedTransfer })

      return updatedTransfer
    }
  },
  Subscription: {
    transferCreated: {
      subscribe: () => pubsub.asyncIterator([TRANSFER_CREATED])
    },
    transferUpdated: {
      subscribe: () => pubsub.asyncIterator([TRANSFER_UPDATED])
    }
  },
  Transfer: {
    dispatcher: async (parent, _) => {
      if (parent.dispatcherId) {
        return await prisma.user.findUnique({
          where: { id: parent.dispatcherId, dispatcher: true }
        })
      }
      return null
    },
    driver: async (parent, _) => {
      if (parent.driverId) {
        const driver = await prisma.driver.findUnique({
          where: { id: parent.driverId }
        })

        // const moscowDate = {}

        // moscowDate["createdAt"] = dateFormatter(driver["createdAt"])
        // moscowDate["updatedAt"] = dateFormatter(driver["updatedAt"])

        // Object.assign(driver, moscowDate)

        return driver
      }
      return null
    },
    persons: async (parent, _) => {
      if (!parent.id) return []

      const passengers = await prisma.transferPassenger.findMany({
        where: { transferId: parent.id },
        include: { personal: true }
      })

      return passengers.map((p) => p.personal).filter(Boolean)
    },
    chats: async (parent, _) => {
      if (parent.id) {
        return await prisma.transferChat.findMany({
          where: { transferId: parent.id }
        })
      }
      return null
    },
    reviews: async (parent, _) => {
      if (parent.id) {
        return await prisma.transferReview.findMany({
          where: { transferId: parent.id }
        })
      }
      return null
    },
    airline: async (parent, _) => {
      if (parent.airlineId) {
        return await prisma.airline.findUnique({
          where: { id: parent.airlineId }
        })
      }
    }
  }
}
export default transferResolver
