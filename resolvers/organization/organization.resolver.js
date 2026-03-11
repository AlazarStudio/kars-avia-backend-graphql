import { allMiddleware } from "../../middlewares/authMiddleware.js"
import { prisma } from "../../prisma.js"
import { uploadImage } from "../../services/files/uploadImage.js"
import { ORGANIZATION_CREATED, pubsub } from "../../services/infra/pubsub.js"
import { withFilter } from "graphql-subscriptions"

const organizationResolver = {
  Query: {
    organizations: async (_, { pagination }, context) => {
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

        orderBy: { information: { city: "asc" } },
        include: {
          transferPrices: {
            include: {
              airportOnTransferPrice: { include: { airport: true } },
              cityOnTransferPrice: { include: { city: true } }
            }
          }
        }
      })

      const totalPages = take && !all ? Math.ceil(totalCount / take) : 1

      return { organizations, totalCount, totalPages }
    },
    organization: async (_, { id }) => {
      try {
        return await prisma.organization.findUnique({
          where: { id: id },
          include: {
            transferPrices: {
              include: {
                airportOnTransferPrice: { include: { airport: true } },
                cityOnTransferPrice: { include: { city: true } }
              }
            }
          }
        })
      } catch {
        return new Error("Неккоректный ID")
      }
    }
  },
  Mutation: {
    createOrganization: async (_, { input, images }) => {
      const { name, information, transferPrices: transferPricesInput } = input

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

      if (transferPricesInput?.length) {
        for (const tp of transferPricesInput) {
          await prisma.transferPrice.create({
            data: {
              organizationId: newOrganization.id,
              prices: tp.prices,
              airportOnTransferPrice: {
                create: (tp.airportIds || []).map((airportId) => ({
                  airport: { connect: { id: airportId } }
                }))
              },
              cityOnTransferPrice: {
                create: (tp.cityIds || []).map((cityId) => ({
                  city: { connect: { id: cityId } }
                }))
              }
            }
          })
        }
      }

      const orgWithRelations = await prisma.organization.findUnique({
        where: { id: newOrganization.id },
        include: {
          transferPrices: {
              include: {
                airportOnTransferPrice: { include: { airport: true } },
                cityOnTransferPrice: { include: { city: true } }
              }
            }
        }
      })

      pubsub.publish(ORGANIZATION_CREATED, {
        organizationCreated: orgWithRelations
      })

      return orgWithRelations
    },

    updateOrganization: async (_, { id, input, images }) => {
      const { transferPrices, ...restInput } = input

      const currentOrganization = await prisma.organization.findUnique({
        where: { id }
      })

      if (!currentOrganization) {
        throw new Error("Организация не найдена")
      }

      const newData = {}

      if (restInput.information) {
        newData.information = {
          ...(currentOrganization.information || {}),
          ...restInput.information
        }
      }

      if (typeof restInput.name === "string") {
        newData.name = restInput.name
      }

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

      if (transferPrices) {
        for (const tp of transferPrices) {
          if (tp.id) {
            await prisma.transferPrice.update({
              where: { id: tp.id },
              data: { prices: tp.prices }
            })
            await prisma.airportOnTransferPrice.deleteMany({
              where: { transferPriceId: tp.id }
            })
            await prisma.cityOnTransferPrice.deleteMany({
              where: { transferPriceId: tp.id }
            })
            if (tp.airportIds?.length) {
              for (const airportId of tp.airportIds) {
                await prisma.airportOnTransferPrice.create({
                  data: { transferPriceId: tp.id, airportId }
                })
              }
            }
            if (tp.cityIds?.length) {
              for (const cityId of tp.cityIds) {
                await prisma.cityOnTransferPrice.create({
                  data: { transferPriceId: tp.id, cityId }
                })
              }
            }
          } else {
            await prisma.transferPrice.create({
              data: {
                organizationId: id,
                prices: tp.prices,
                airportOnTransferPrice: {
                  create: (tp.airportIds || []).map((airportId) => ({
                    airport: { connect: { id: airportId } }
                  }))
                },
                cityOnTransferPrice: {
                  create: (tp.cityIds || []).map((cityId) => ({
                    city: { connect: { id: cityId } }
                  }))
                }
              }
            })
          }
        }
      }

      const orgWithRelations = await prisma.organization.findUnique({
        where: { id },
        include: {
          transferPrices: {
              include: {
                airportOnTransferPrice: { include: { airport: true } },
                cityOnTransferPrice: { include: { city: true } }
              }
            }
        }
      })

      pubsub.publish(ORGANIZATION_CREATED, {
        organizationCreated: orgWithRelations
      })

      return orgWithRelations
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
    },
    deleteOrganizationTransferPrice: async (_, { id }) => {
      const transferPrice = await prisma.transferPrice.findUnique({
        where: { id },
        select: { id: true, organizationId: true }
      })

      if (!transferPrice?.organizationId) {
        return false
      }

      await prisma.$transaction([
        prisma.airportOnTransferPrice.deleteMany({
          where: { transferPriceId: id }
        }),
        prisma.cityOnTransferPrice.deleteMany({
          where: { transferPriceId: id }
        }),
        prisma.transferPrice.delete({ where: { id } })
      ])

      const orgWithRelations = await prisma.organization.findUnique({
        where: { id: transferPrice.organizationId },
        include: {
          transferPrices: {
            include: {
              airportOnTransferPrice: { include: { airport: true } },
              cityOnTransferPrice: { include: { city: true } }
            }
          }
        }
      })

      if (orgWithRelations) {
        pubsub.publish(ORGANIZATION_CREATED, {
          organizationCreated: orgWithRelations
        })
      }

      return true
    }
  },
  Subscription: {
    organizationCreated: {
      subscribe: withFilter(
        () => pubsub.asyncIterator([ORGANIZATION_CREATED]),
        (payload, variables, context) => {
          const { subject, subjectType } = context

          if (!subject || subjectType !== "USER") return false

          // Только SUPERADMIN и диспетчеры видят создание организаций
          return subject.role === "SUPERADMIN" || subject.dispatcher === true
        }
      )
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
