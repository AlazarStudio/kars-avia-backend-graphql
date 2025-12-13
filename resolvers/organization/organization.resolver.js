import { prisma } from "../../prisma.js"
import { ORGANIZATION_CREATED, pubsub } from "../../services/infra/pubsub.js"

const organizationResolver = {
  Query: {
    organizations: async () => {
      return await prisma.organization.findMany({})
    },
    organization: async (_, { id }) => {
      try {
        return await prisma.organization.findUnique({ where: { id: id } })
      } catch {
        return new Error("Неккоректный ID")
      }
    }
  },
  Mutation: {
    createOrganization: async (_, { input }) => {
      const { name, information } = input

      const existingOrganization = await prisma.organization.findFirst({
        where: { name: name }
      })

      if (existingOrganization) {
        if (existingOrganization.name == name) {
          throw new Error(
            "Организация с таким name уже существует",
            "ORGANIZATION_EXISTS"
          )
        }
      }

      const newOrganization = await prisma.organization.create({
        data: {
          name: name,
          information: information
        }
      })

      pubsub.publish(ORGANIZATION_CREATED, {
        organizationCreated: newOrganization
      })

      return newOrganization
    },
    updateOrganization: async (_, { id, input }) => {
      const currentOrganization = await prisma.organization.findUnique({
        where: { id: id }
      })

      const newData = {}
      if (input["information"]) {
        const newInformation = currentOrganization["information"]
        Object.assign(newInformation, input["information"])

        newData["information"] = newInformation
      }

      if (input["name"]) newData["name"] = input["name"]

      const updatedOrganization = await prisma.organization.update({
        where: { id: id },
        data: newData
      })

      pubsub.publish(ORGANIZATION_CREATED, {
        organizationCreated: updatedOrganization
      })

      return updatedOrganization
    },
    deleteOrganization: async (_, { id }) => {
      try {
        const deletedOrganization = await prisma.organization.update({
          where: { id: id },
          data: {
            active: false
          }
        })

        return deletedOrganization
      } catch {
        return new Error("Некорректное ID")
      }
    }
  },
  Subscription: {
    organizationCreated: {
      subscribe: () => pubsub.asyncIterator([ORGANIZATION_CREATED])
    }
  },
  Organization: {
    drivers: async (parent, _) => {
      return await prisma.driver.findMany({
        where: { organizationId: parent.id }
      })
    }
  }
}

export default organizationResolver
