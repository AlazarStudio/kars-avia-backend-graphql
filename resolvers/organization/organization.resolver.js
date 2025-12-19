import { prisma } from "../../prisma.js"
import { uploadImage } from "../../services/files/uploadImage.js"
import { ORGANIZATION_CREATED, pubsub } from "../../services/infra/pubsub.js"

const organizationResolver = {
  Query: {
    organizations: async ({ pagination }, context) => {
      await allMiddleware(context)
      const { user } = context
      const { skip, take, all } = pagination || {}

      const isSuper = user.role === "SUPERADMIN" || user.dispatcher === true

      const where = isSuper ? { active: true } : { active: true, show: true }

      const totalCount = await prisma.organization.count({ where })

      const organizations = await prisma.organization.findMany({
        where,
        ...(all
          ? {}
          : {
              skip:
                typeof skip === "number" && typeof take === "number"
                  ? skip * take
                  : undefined,
              take: typeof take === "number" ? take : undefined
            }),

        orderBy: { information: { city: "asc" } }
      })

      const totalPages = take && !all ? Math.ceil(totalCount / take) : 1

      return { organizations, totalCount, totalPages }
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
    createOrganization: async (_, { input, images }) => {
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

      let imagePaths = []
      if (images && images.length > 0) {
        for (const image of images) {
          imagePaths.push(await uploadImage(image, { bucket: "organization" }))
        }
      }

      const newOrganization = await prisma.organization.create({
        data: {
          name: name,
          information: information,
          images: imagePaths
        }
      })

      pubsub.publish(ORGANIZATION_CREATED, {
        organizationCreated: newOrganization
      })

      return newOrganization
    },

    updateOrganization: async (_, { id, input, images }) => {
      // 1. Берём текущую организацию
      const currentOrganization = await prisma.organization.findUnique({
        where: { id }
      })

      if (!currentOrganization) {
        throw new Error("Организация не найдена")
      }

      const newData = {}

      // 2. Обновляем information — БЕЗ мутации старого объекта
      if (input.information) {
        newData.information = {
          ...(currentOrganization.information || {}),
          ...input.information
        }
      }

      // 3. Простые поля
      if (typeof input.name === "string") {
        newData.name = input.name
      }

      // 4. Картинки
      // Логика:
      // - images === undefined | null → вообще не трогаем поле images
      // - images === [] → явно очистить все картинки
      // - images.length > 0 → загрузить и ДОБАВИТЬ к существующим

      let imagePaths = []
      if (images && images.length > 0) {
        for (const image of images) {
          imagePaths.push(await uploadImage(image, { bucket: "organization" }))
        }
        newData.images = imagePaths
      }

      const updatedOrganization = await prisma.organization.update({
        where: { id },
        data: newData
      })

      // Я бы переименовал событие в ORGANIZATION_UPDATED, но оставляю как у тебя
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
