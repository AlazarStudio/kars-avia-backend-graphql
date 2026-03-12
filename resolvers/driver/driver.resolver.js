import { prisma } from "../../prisma.js"
import argon2 from "argon2"
import jwt from "jsonwebtoken"
import GraphQLUpload from "graphql-upload/GraphQLUpload.mjs"
// import { uploadFiles } from "../../exports/uploadFiles.js"
import { uploadImage } from "../../services/files/uploadImage.js"
import {
  DRIVER_CREATED,
  DRIVER_UPDATED,
  pubsub
} from "../../services/infra/pubsub.js"
import { withFilter } from "graphql-subscriptions"
import { dateFormatter } from "../../services/format/dateTimeFormatterVersion2.js"
import { uploadFiles } from "../../services/files/uploadFiles.js"
import { allMiddleware } from "../../middlewares/authMiddleware.js"
// import { errorMonitor } from "ws"

const driverResolver = {
  Upload: GraphQLUpload,

  Query: {
    drivers: async (_, { pagination }, context) => {
      await allMiddleware(context) // MIDDLEWARE_REVIEW: allMiddleware
      const { skip, take, all } = pagination || {}
      const totalCount = await prisma.driver.count({ where: { active: true } })
      const drivers = all
        ? await prisma.driver.findMany({
            where: { active: true },
            include: {
              organization: true,
              transferPrices: {
                include: {
                  airportOnTransferPrice: { include: { airport: true } },
                  cityOnTransferPrice: { include: { city: true } }
                }
              }
            }
          })
        : await prisma.driver.findMany({
            where: { active: true },
            skip: skip,
            take: take,
            include: {
              organization: true,
              transferPrices: {
                include: {
                  airportOnTransferPrice: { include: { airport: true } },
                  cityOnTransferPrice: { include: { city: true } }
                }
              }
            }
          })

      // const moscowDates = []

      // for (let driver of drivers) {
      //   moscowDates.push({
      //     createdAt: dateFormatter(driver["createdAt"]),
      //     updatedAt: dateFormatter(driver["updatedAt"])
      //   })
      // }

      // for (let i in moscowDates) {
      //   Object.assign(drivers[i], moscowDates[i])
      // }

      const totalPages = take && !all ? Math.ceil(totalCount / take) : 1

      return { drivers, totalCount, totalPages }
    },
    driverById: async (_, { id }, context) => {
      await allMiddleware(context) // MIDDLEWARE_REVIEW: allMiddleware
      try {
        const driver = await prisma.driver.findUnique({
          where: { id: id },
          include: {
            organization: true,
            transferPrices: {
              include: {
                airportOnTransferPrice: { include: { airport: true } },
                cityOnTransferPrice: { include: { city: true } }
              }
            }
          }
        })
        // const moscowDate = {}

        // moscowDate["createdAt"] = dateFormatter(driver["createdAt"])
        // moscowDate["updatedAt"] = dateFormatter(driver["updatedAt"])

        // Object.assign(driver, moscowDate)

        return driver
      } catch {
        return new Error("Было введено некорректное ID или не существующее ID")
      }
    },
    driverByEmail: async (_, { email }, context) => {
      await allMiddleware(context) // MIDDLEWARE_REVIEW: allMiddleware
      try {
        const driver = await prisma.driver.findUnique({
          where: { email: email },
          include: {
            organization: true,
            transferPrices: {
              include: {
                airportOnTransferPrice: { include: { airport: true } },
                cityOnTransferPrice: { include: { city: true } }
              }
            }
          }
        })

        // const moscowDate = {}

        // moscowDate["createdAt"] = dateFormatter(driver["createdAt"])
        // moscowDate["updatedAt"] = dateFormatter(driver["updatedAt"])

        // Object.assign(driver, moscowDate)

        return driver
      } catch {
        return new Error(
          "Был введен не корректный EMAIL или не существующий EMAIL"
        )
      }
    }
  },
  Mutation: {
    createDriver: async (
      _,
      {
        input,
        driverPhoto,
        carPhotos,
        stsPhoto,
        ptsPhoto,
        osagoPhoto,
        licensePhoto
      },
      context
    ) => {
      await allMiddleware(context) // MIDDLEWARE_REVIEW: allMiddleware
      const {
        name,
        number,
        email,
        password,
        car,
        vehicleNumber,
        driverLicenseNumber,
        driverLicenseIssueYear,
        extraEquipment,
        organizationId,
        seats,
        transferPrices: transferPricesInput,
        registrationStatus
      } = input

      if (email || number) {
        const existing = await prisma.driver.findFirst({
          where: {
            OR: [...(email ? [{ email }] : []), ...(number ? [{ number }] : [])]
          }
        })
        if (existing) {
          if (existing.email === email && existing.number === number)
            throw new Error("Водитель с таким email и телефоном уже существует")
          if (existing.email === email)
            throw new Error("Водитель с таким email уже существует")
          if (existing.number === number)
            throw new Error("Водитель с таким телефоном уже существует")
        }
      }

      const hashedPassword = password ? await argon2.hash(password) : undefined

      let driverPhotoPaths = []
      if (driverPhoto != undefined) {
        if (driverPhoto.length > 0) {
          for (const image of driverPhoto) {
            driverPhotoPaths.push(await uploadFiles(image))
          }
        }
      }
      let carPhotosPaths = []
      if (carPhotos != undefined) {
        if (carPhotos.length > 0) {
          for (const image of carPhotos) {
            carPhotosPaths.push(await uploadFiles(image))
          }
        }
      }
      let stsPhotoPaths = []
      if (stsPhoto != undefined) {
        if (stsPhoto.length > 0) {
          for (const image of stsPhoto) {
            stsPhotoPaths.push(await uploadFiles(image))
          }
        }
      }
      let ptsPhotoPaths = []
      if (ptsPhoto != undefined) {
        if (ptsPhoto.length > 0) {
          for (const image of ptsPhoto) {
            ptsPhotoPaths.push(await uploadFiles(image))
          }
        }
      }
      let osagoPhotoPaths = []
      if (osagoPhoto != undefined) {
        if (osagoPhoto.length > 0) {
          for (const image of osagoPhoto) {
            osagoPhotoPaths.push(await uploadFiles(image))
          }
        }
      }
      let licensePhotoPaths = []
      if (licensePhoto != undefined) {
        if (licensePhoto.length > 0) {
          for (const image of licensePhoto) {
            licensePhotoPaths.push(await uploadFiles(image))
          }
        }
      }

      const documents = {
        driverPhoto: driverPhotoPaths,
        carPhotos: carPhotosPaths,
        stsPhoto: stsPhotoPaths,
        ptsPhoto: ptsPhotoPaths,
        osagoPhoto: osagoPhotoPaths,
        licensePhoto: licensePhotoPaths
      }

      const data = {
        name,
        number,
        email,
        password: hashedPassword,
        car,
        vehicleNumber,
        driverLicenseNumber,
        driverLicenseIssueYear,
        extraEquipment,
        organizationId,
        seats,
        registrationStatus: registrationStatus ?? "PENDING",
        documents
      }

      const newDriver = await prisma.driver.create({ data })

      if (transferPricesInput?.length) {
        for (const tp of transferPricesInput) {
          await prisma.transferPrice.create({
            data: {
              driverId: newDriver.id,
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

      const driverWithRelations = await prisma.driver.findUnique({
        where: { id: newDriver.id },
        include: {
          organization: true,
          transferPrices: {
            include: {
              airportOnTransferPrice: { include: { airport: true } },
              cityOnTransferPrice: { include: { city: true } }
            }
          }
        }
      })

      pubsub.publish(DRIVER_CREATED, { driverCreated: driverWithRelations })

      return driverWithRelations
    },

    updateDriver: async (
      _,
      {
        id,
        input,
        driverPhoto,
        carPhotos,
        stsPhoto,
        ptsPhoto,
        osagoPhoto,
        licensePhoto
      },
      context
    ) => {
      await allMiddleware(context) // MIDDLEWARE_REVIEW: allMiddleware
      const updatedData = {}

      const currentDriver = await prisma.driver.findUnique({
        where: { id: id }
      })

      // При отправке данных без newPassword выдаёт ошибку, что newPassword не может быть undefined, переписать условия проверки инпутов

      for (let key in input) {
        if (
          key !== "newPassword" &&
          key !== "oldPassword" &&
          key !== "transferPrices" &&
          input[key] !== undefined
        ) {
          updatedData[key] = input[key]
        }
      }

      if (input.newPassword) {
        if (!input.oldPassword)
          throw new Error("Для обновления пароля укажи старый.")
        const valid = await argon2.verify(
          currentDriver.password,
          input.oldPassword
        )
        if (!valid) throw new Error("Указан неверный пароль.")
        updatedData.password = await argon2.hash(input.newPassword)
      }

      let driverPhotoPaths = currentDriver.documents?.driverPhoto ?? []

      if (driverPhoto != undefined) {
        if (driverPhoto.length > 0) {
          for (const image of driverPhoto) {
            driverPhotoPaths.push(
              await uploadImage(image, { bucket: "driver", entityId: id })
            )
          }
        }
      }

      let carPhotosPaths = currentDriver.documents?.carPhotos ?? []
      if (carPhotos != undefined) {
        if (carPhotos.length > 0) {
          for (const image of carPhotos) {
            carPhotosPaths.push(
              await uploadImage(image, { bucket: "driver", entityId: id })
            )
          }
        }
      }
      let stsPhotoPaths = currentDriver.documents?.stsPhoto ?? []
      if (stsPhoto != undefined) {
        if (stsPhoto.length > 0) {
          for (const image of stsPhoto) {
            stsPhotoPaths.push(
              await uploadImage(image, { bucket: "driver", entityId: id })
            )
          }
        }
      }
      let ptsPhotoPaths = currentDriver.documents?.ptsPhoto ?? []
      if (ptsPhoto != undefined) {
        if (ptsPhoto.length > 0) {
          for (const image of ptsPhoto) {
            ptsPhotoPaths.push(
              await uploadImage(image, { bucket: "driver", entityId: id })
            )
          }
        }
      }
      let osagoPhotoPaths = currentDriver.documents?.osagoPhoto ?? []
      if (osagoPhoto != undefined) {
        if (osagoPhoto.length > 0) {
          for (const image of osagoPhoto) {
            osagoPhotoPaths.push(
              await uploadImage(image, { bucket: "driver", entityId: id })
            )
          }
        }
      }
      let licensePhotoPaths = currentDriver.documents?.licensePhoto ?? []
      if (licensePhoto != undefined) {
        if (licensePhoto.length > 0) {
          for (const image of licensePhoto) {
            licensePhotoPaths.push(
              await uploadImage(image, { bucket: "driver", entityId: id })
            )
          }
        }
      }

      updatedData.documents = {
        driverPhoto: driverPhotoPaths,
        carPhotos: carPhotosPaths,
        stsPhoto: stsPhotoPaths,
        ptsPhoto: ptsPhotoPaths,
        osagoPhoto: osagoPhotoPaths,
        licensePhoto: licensePhotoPaths
      }

      const updatedDriver = await prisma.driver.update({
        where: { id: id },
        data: updatedData
      })

      if (input.transferPrices) {
        for (const tp of input.transferPrices) {
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
                driverId: id,
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

      const driverWithRelations = await prisma.driver.findUnique({
        where: { id },
        include: {
          organization: true,
          transferPrices: {
            include: {
              airportOnTransferPrice: { include: { airport: true } },
              cityOnTransferPrice: { include: { city: true } }
            }
          }
        }
      })

      pubsub.publish(DRIVER_UPDATED, { driverUpdated: driverWithRelations })

      return driverWithRelations
    },

    // transferSignIn: async (_, { input }) => {
    //   const { email, password } = input
    //   // Ищем пользователя по логину
    //   const user = await prisma.driver.findUnique({ where: { email } })
    //   // Проверка корректности пароля с помощью argon2.verify
    //   if (!user.active) {
    //     throw new Error("User is not active")
    //   }

    //   if (!user || !(await argon2.verify(user.password, password))) {
    //     throw new Error("Invalid credentials")
    //   }

    //   // Генерация токена доступа
    //   const token = jwt.sign(
    //     {
    //       userId: user.id,
    //       role: "DRIVER"
    //     },
    //     process.env.JWT_SECRET,
    //     { expiresIn: "24h" }
    //   )

    //   return {
    //     ...user,
    //     token
    //   }
    // },

    updateDriverDocuments: async (_, { id, documents }, context) => {
      await allMiddleware(context) // MIDDLEWARE_REVIEW: allMiddleware
      const setDocs = await uploadFiles(documents)
      await prisma.driver.update({
        where: { id },
        data: { documents: { set: setDocs } } // если это одна картинка
      })

      const driverWithUpdatedDocs = await prisma.driver.findUnique({
        where: { id }
      })

      // const moscowDate = {}

      // moscowDate["createdAt"] = dateFormatter(
      //   driverWithUpdatedDocs["createdAt"]
      // )
      // moscowDate["updatedAt"] = dateFormatter(
      //   driverWithUpdatedDocs["updatedAt"]
      // )

      // Object.assign(driverWithUpdatedDocs, moscowDate)

      return driverWithUpdatedDocs
    },
    deleteDriver: async (_, { id }, context) => {
      await allMiddleware(context) // MIDDLEWARE_REVIEW: allMiddleware
      try {
        const deletedDriver = await prisma.driver.delete({
          where: { id: id }
          // include: { organization: true },
          // data: {
          //   active: false
          // }
        })
        // const moscowDate = {}

        // moscowDate["createdAt"] = dateFormatter(deletedDriver["createdAt"])
        // moscowDate["updatedAt"] = dateFormatter(deletedDriver["updatedAt"])
        // Object.assign(deletedDriver, moscowDate)

        return deletedDriver
      } catch {
        return new Error("Было введено не корректное ID или не существующее ID")
      }
    },
    deleteDriverTransferPrice: async (_, { id }, context) => {
      await allMiddleware(context) // MIDDLEWARE_REVIEW: allMiddleware
      const transferPrice = await prisma.transferPrice.findUnique({
        where: { id },
        select: { id: true, driverId: true }
      })

      if (!transferPrice?.driverId) {
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

      const driverWithRelations = await prisma.driver.findUnique({
        where: { id: transferPrice.driverId },
        include: {
          organization: true,
          transferPrices: {
            include: {
              airportOnTransferPrice: { include: { airport: true } },
              cityOnTransferPrice: { include: { city: true } }
            }
          }
        }
      })

      if (driverWithRelations) {
        pubsub.publish(DRIVER_UPDATED, { driverUpdated: driverWithRelations })
      }

      return true
    }
  },
  Subscription: {
    driverCreated: {
      subscribe: withFilter(
        () => pubsub.asyncIterator([DRIVER_CREATED]),
        async (payload, variables, context) => {
          try {
            await allMiddleware(context) // MIDDLEWARE_REVIEW: allMiddleware
          } catch {
            return false
          }
          const { subject, subjectType } = context

          if (!subject) return false

          // SUPERADMIN и диспетчеры видят все
          if (
            subjectType === "USER" &&
            (subject.role === "SUPERADMIN" || subject.dispatcher === true)
          ) {
            return true
          }

          // Водители видят только свои обновления
          const driver = payload.driverCreated
          if (subjectType === "DRIVER" && driver.id === subject.id) {
            return true
          }

          return false
        }
      )
    },
    driverUpdated: {
      subscribe: withFilter(
        () => pubsub.asyncIterator([DRIVER_UPDATED]),
        async (payload, variables, context) => {
          try {
            await allMiddleware(context) // MIDDLEWARE_REVIEW: allMiddleware
          } catch {
            return false
          }
          const { subject, subjectType } = context

          if (!subject) return false

          // SUPERADMIN и диспетчеры видят все
          if (
            subjectType === "USER" &&
            (subject.role === "SUPERADMIN" || subject.dispatcher === true)
          ) {
            return true
          }

          // Водители видят только свои обновления
          const driver = payload.driverUpdated
          if (subjectType === "DRIVER" && driver.id === subject.id) {
            return true
          }

          return false
        }
      )
    }
  },
  Driver: {
    organization: async (parent, _) => {
      if (parent.organizationId) {
        return await prisma.organization.findUnique({
          where: { id: parent.organizationId }
        })
      }
      return null
    },
    transfers: async (parent, _) => {
      if (parent.id) {
        return await prisma.transfer.findMany({
          where: { driverId: parent.id }
        })
      }
    },
    transferMessages: async (parent, _) => {
      if (parent.id) {
        return await prisma.transferMessage.findMany({
          where: { senderDriverId: parent.id }
        })
      }
    }
  }
}

export default driverResolver
