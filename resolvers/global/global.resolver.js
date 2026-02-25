import { prisma } from "../../prisma.js"
import argon2 from "argon2"
import jwt from "jsonwebtoken"
import { finished } from "stream/promises"
import GraphQLUpload from "graphql-upload/GraphQLUpload.mjs"
import { createWriteStream } from "fs"
import path from "path" // Импортируем модуль path
import { allMiddleware } from "../../middlewares/authMiddleware.js"
import { v4 as uuidv4 } from "uuid"

const SUBJECT = {
  USER: "USER",
  DRIVER: "DRIVER",
  AIRLINE_PERSONAL: "AIRLINE_PERSONAL"
}

async function resolveAuthSubject(identifier) {
  const id = String(identifier).trim()

  // ищем всех параллельно
  const [
    userByLogin,
    userByEmail,
    driverByEmail,
    // airlinePersonalByEmail,   // если появится email
    airlinePersonalByEmail
  ] = await Promise.all([
    prisma.user.findUnique({ where: { login: id } }),
    prisma.user.findUnique({ where: { email: id } }),
    prisma.driver.findUnique({ where: { email: id } }),
    prisma.airlinePersonal.findFirst({ where: { email: id } }) // исправить на что-то уникальное
  ])

  const candidates = []

  if (userByLogin) candidates.push({ type: SUBJECT.USER, entity: userByLogin })
  else if (userByEmail)
    candidates.push({ type: SUBJECT.USER, entity: userByEmail })

  if (driverByEmail)
    candidates.push({ type: SUBJECT.DRIVER, entity: driverByEmail })

  if (airlinePersonalByEmail)
    candidates.push({
      type: SUBJECT.AIRLINE_PERSONAL,
      entity: airlinePersonalByEmail
    })

  if (!candidates.length) {
    throw new Error("Invalid credentials")
  }

  // если один и тот же id может совпасть в разных таблицах — либо
  // кидаем ошибку, либо задаём приоритет (например, USER > DRIVER > AIRLINE_PERSONAL)
  if (candidates.length > 1) {
    // вариант 1: строгая ошибка
    // throw new Error('Ambiguous identifier, contact support');

    // вариант 2: приоритет
    const byPriority =
      candidates.find((c) => c.type === SUBJECT.USER) ||
      candidates.find((c) => c.type === SUBJECT.DRIVER) ||
      candidates[0]

    return byPriority
  }

  return candidates[0]
}

const globalResolver = {
  Upload: GraphQLUpload,
  Mutation: {
    singleUpload: async (_, { file }, context) => {
      await allMiddleware(context)
      const { createReadStream, filename, mimetype, encoding } = await file
      // Определяем путь для сохранения файла в папке uploads
      const uploadPath = path.join(process.cwd(), "uploads", filename)
      // Чтение потока и запись файла в папку uploads
      const stream = createReadStream()
      const out = createWriteStream(uploadPath)
      stream.pipe(out)
      await finished(out)

      return { filename, mimetype, encoding }
    },
    transferSignIn: async (_, { input }) => {
      const { identifier, password, fingerprint, token2FA } = input

      // 1. Находим сущность и её тип
      const { entity, type } = await resolveAuthSubject(identifier)

      // 2. Базовые проверки
      if ("active" in entity && !entity.active) {
        throw new Error("User is not active")
      }

      if (
        !entity.password ||
        !(await argon2.verify(entity.password, password))
      ) {
        throw new Error("Invalid credentials")
      }

      let jwtPayload = { subjectType: type }
      let refreshToken = null

      // 3. Спец-логика по типам

      if (type === SUBJECT.USER) {
        // 2FA только для User

        // if (entity.is2FAEnabled) {
        //   let verified = false

        //   if (entity.twoFAMethod === "TOTP") {
        //     verified = speakeasy.totp.verify({
        //       secret: entity.twoFASecret,
        //       encoding: "base32",
        //       token: token2FA
        //     })
        //   } else if (entity.twoFAMethod === "HOTP") {
        //     verified = speakeasy.hotp.verify({
        //       secret: entity.twoFASecret,
        //       encoding: "base32",
        //       token: token2FA,
        //       counter: 0
        //     })
        //   }

        //   if (!verified) {
        //     throw new Error("Invalid 2FA token")
        //   }
        // }

        jwtPayload = {
          ...jwtPayload,
          userId: entity.id,
          role: entity.role,
          hotelId: entity.hotelId,
          airlineId: entity.airlineId,
          departmentId: entity.airlineDepartmentId
        }

        refreshToken = uuidv4()
        await prisma.user.update({
          where: { id: entity.id },
          data: { refreshToken, fingerprint }
        })
        jwtPayload = {
          ...jwtPayload,
          sessionToken: refreshToken
        }
      }

      if (type === SUBJECT.DRIVER) {
        jwtPayload = {
          ...jwtPayload,
          driverId: entity.id,
          role: "DRIVER",
          organizationId: entity.organizationId,
          registrationStatus: entity.registrationStatus
        }

        refreshToken = uuidv4()
        await prisma.driver.update({
          where: { id: entity.id },
          data: { refreshToken, fingerprint }
        })
        jwtPayload = {
          ...jwtPayload,
          sessionToken: refreshToken
        }
      }

      if (type === SUBJECT.AIRLINE_PERSONAL) {
        jwtPayload = {
          ...jwtPayload,
          airlinePersonalId: entity.id,
          role: "AIRLINE_PERSONAL",
          airlineId: entity.airlineId
        }

        refreshToken = uuidv4()
        await prisma.airlinePersonal.update({
          where: { id: entity.id },
          data: { refreshToken, fingerprint }
        })
        jwtPayload = {
          ...jwtPayload,
          sessionToken: refreshToken
        }
      }

      // 4. Генерим JWT
      const token = jwt.sign(jwtPayload, process.env.JWT_SECRET, {
        expiresIn: "24h"
      })

      // 5. Общий ответ
      return {
        token,
        refreshToken,
        subjectType: type,
        user: type === SUBJECT.USER ? entity : null,
        driver: type === SUBJECT.DRIVER ? entity : null,
        airlinePersonal: type === SUBJECT.AIRLINE_PERSONAL ? entity : null
      }
    },
    // refreshDriverToken: async (_, { refreshToken, fingerprint }) => {
    //   const driver = await prisma.driver.findFirst({
    //     where: { refreshToken }
    //   })
    //   if (!driver) {
    //     throw new Error("Invalid refresh token")
    //   }
    //   if (fingerprint !== driver.fingerprint) {
    //     throw new Error("Invalid fingerprint")
    //   }
    //   const newAccessToken = jwt.sign(
    //     {
    //       subjectType: SUBJECT.DRIVER,
    //       driverId: driver.id,
    //       role: "DRIVER",
    //       organizationId: driver.organizationId,
    //       registrationStatus: driver.registrationStatus
    //     },
    //     process.env.JWT_SECRET,
    //     { expiresIn: "24h" }
    //   )
    //   const newRefreshToken = uuidv4()
    //   await prisma.driver.update({
    //     where: { id: driver.id },
    //     data: { refreshToken: newRefreshToken }
    //   })

    //   return {
    //     token: newAccessToken,
    //     refreshToken: newRefreshToken
    //   }
    // },
    // refreshAirlinePersonalToken: async (_, { refreshToken, fingerprint }) => {
    //   const airlinePersonal = await prisma.airlinePersonal.findFirst({
    //     where: { refreshToken }
    //   })
    //   if (!airlinePersonal) {
    //     throw new Error("Invalid refresh token")
    //   }
    //   if (fingerprint !== airlinePersonal.fingerprint) {
    //     throw new Error("Invalid fingerprint")
    //   }
    //   const newAccessToken = jwt.sign(
    //     {
    //       subjectType: SUBJECT.AIRLINE_PERSONAL,
    //       airlinePersonalId: airlinePersonal.id,
    //       role: "AIRLINE_PERSONAL",
    //       airlineId: airlinePersonal.airlineId
    //     },
    //     process.env.JWT_SECRET,
    //     { expiresIn: "24h" }
    //   )
    //   const newRefreshToken = uuidv4()
    //   await prisma.airlinePersonal.update({
    //     where: { id: airlinePersonal.id },
    //     data: { refreshToken: newRefreshToken }
    //   })

    //   return {
    //     token: newAccessToken,
    //     refreshToken: newRefreshToken
    //   }
    // }
  }
}

export default globalResolver
