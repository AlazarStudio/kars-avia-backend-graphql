// Импорт необходимых модулей и утилит
import { prisma } from "../../prisma.js"
import argon2 from "argon2"
import jwt from "jsonwebtoken"
import GraphQLUpload from "graphql-upload/GraphQLUpload.mjs"
import { uploadImage, deleteImage } from "../../services/files/uploadImage.js"
import logAction from "../../services/infra/logaction.js"
import {
  adminHotelAirMiddleware,
  adminMiddleware,
  airlineAdminMiddleware,
  allMiddleware,
  hotelAdminMiddleware,
  superAdminMiddleware,
  dispatcherOrSuperAdminMiddleware,
  representativeMiddleware
} from "../../middlewares/authMiddleware.js"
import speakeasy from "@levminer/speakeasy"
import qrcode from "qrcode"
import nodemailer from "nodemailer"
import { v4 as uuidv4 } from "uuid"
import {
  pubsub,
  USER_CREATED,
  USER_ONLINE
} from "../../services/infra/pubsub.js"
import { subscriptionAuthMiddleware } from "../../services/infra/subscriptionAuth.js"
import { withFilter } from "graphql-subscriptions"
import { sendEmail } from "../../services/sendMail.js"
import { sendResetPasswordEmail } from "../../services/user/sendResetPasswordEmail.js"
import { logger } from "../../services/infra/logger.js"
import { buildClosedSessionStats } from "../../services/user/userActivity.js"
import { normalizeUserLogin } from "../../services/auth/normalizeUserLogin.js"

// Создаем транспортёр для отправки email с использованием SMTP
const transporter = nodemailer.createTransport({
  host: "smtp.beget.com",
  port: 465,
  secure: true,
  auth: {
    user: process.env.EMAIL_USER,
    pass: process.env.EMAIL_PASSWORD
  }
})

const buildOfflineUpdateData = ({ currentUser, now }) => {
  const { addedMinutes, nextDailyStats } = buildClosedSessionStats({
    sessionStartedAt: currentUser?.sessionStartedAt,
    currentDailyStats: currentUser?.dailyTimeStats || [],
    now
  })

  return {
    isOnline: false,
    sessionStartedAt: null,
    lastSeen: now,
    totalTimeMinutes: (currentUser?.totalTimeMinutes || 0) + addedMinutes,
    dailyTimeStats: nextDailyStats
  }
}

const buildUserAuthPayload = ({ user, sessionToken }) => {
  const token = jwt.sign(
    {
      subjectType: "USER",
      userId: user.id,
      role: user.role,
      hotelId: user.hotelId,
      airlineId: user.airlineId,
      airlineDepartmentId: user.airlineDepartmentId,
      dispatcherDepartmentId: user.dispatcherDepartmentId,
      representativeDepartmentId: user.representativeDepartmentId,
      sessionToken
    },
    process.env.JWT_SECRET,
    { expiresIn: "24h" }
  )

  return {
    ...user,
    token,
    refreshToken: sessionToken
  }
}

const USER_TYPE = {
  DEFAULT: "DEFAULT",
  REPRESENTATIVE: "REPRESENTATIVE"
}

const ROLE = {
  REPRESENTATIVE: "REPRESENTATIVE"
}

const resolveRoleAndUserType = ({ role, userType, fallbackRole = "USER" }) => {
  const finalRole = role || fallbackRole
  let finalUserType = userType || USER_TYPE.DEFAULT

  // Keep role/userType consistent for representative accounts.
  if (finalRole === ROLE.REPRESENTATIVE) {
    finalUserType = USER_TYPE.REPRESENTATIVE
  } else if (finalUserType === USER_TYPE.REPRESENTATIVE) {
    finalUserType = USER_TYPE.DEFAULT
  }

  return { finalRole, finalUserType }
}

// Основной объект-резольвер для работы с пользователями (userResolver)
const userResolver = {
  // Подключаем тип Upload для поддержки загрузки файлов через GraphQL
  Upload: GraphQLUpload,

  Query: {
    // Получение всех пользователей, сортированных по имени (возвращает всех)
    users: async (_, { pagination }, context) => {
      await allMiddleware(context) // MIDDLEWARE_REVIEW: allMiddleware

      const { skip = 0, take = 10, all, search } = pagination
      const searchFilter = search
        ? {
            OR: [{ user: { name: { contains: search, mode: "insensitive" } } }]
          }
        : null
      const filters = [
        { active: true },
        ...(searchFilter ? [searchFilter] : [])
      ]
      const where = {
        AND: filters
      }

      const totalCount = await prisma.user.count({ where })

      const users = all
        ? prisma.user.findMany({
            where,
            orderBy: { name: "asc" },
            include: { position: true }
          })
        : prisma.user.findMany({
            where,
            skip: skip ? skip * take : undefined,
            take: take || undefined,
            orderBy: { name: "asc" },
            include: { position: true }
          })

      const totalPages = take && !all ? Math.ceil(totalCount / take) : 1
      return { users, totalCount, totalPages }
    },
    // Получение пользователей, привязанных к конкретной авиакомпании по airlineId
    airlineUsers: async (_, { airlineId, pagination }, context) => {
      await allMiddleware(context) // MIDDLEWARE_REVIEW: allMiddleware
      const { skip = 0, take = 10, all, search } = pagination
      const searchFilter = search
        ? {
            OR: [{ user: { name: { contains: search, mode: "insensitive" } } }]
          }
        : null
      const filters = [
        { airlineId, active: true },
        ...(searchFilter ? [searchFilter] : [])
      ]
      const where = {
        AND: filters
      }

      const totalCount = await prisma.user.count({ where })

      const users = all
        ? prisma.user.findMany({
            where,
            orderBy: { name: "asc" },
            include: { position: true }
          })
        : prisma.user.findMany({
            where,
            skip: skip ? skip * take : undefined,
            take: take || undefined,
            orderBy: { name: "asc" },
            include: { position: true }
          })
      const totalPages = take && !all ? Math.ceil(totalCount / take) : 1
      return { users, totalCount, totalPages }
    },
    // Получение пользователей, привязанных к конкретному отелю по hotelId
    hotelUsers: async (_, { hotelId, pagination }, context) => {
      await allMiddleware(context) // MIDDLEWARE_REVIEW: allMiddleware
      const { skip = 0, take = 10, all, search } = pagination
      const searchFilter = search
        ? {
            OR: [{ user: { name: { contains: search, mode: "insensitive" } } }]
          }
        : null
      const filters = [
        { hotelId, active: true },
        ...(searchFilter ? [searchFilter] : [])
      ]
      const where = {
        AND: filters
      }

      const totalCount = await prisma.user.count({ where })

      const users = all
        ? prisma.user.findMany({
            where,
            orderBy: { name: "asc" },
            include: { position: true }
          })
        : prisma.user.findMany({
            where,
            skip: skip ? skip * take : undefined,
            take: take || undefined,
            orderBy: { name: "asc" },
            include: { position: true }
          })
      const totalPages = take && !all ? Math.ceil(totalCount / take) : 1
      return { users, totalCount, totalPages }
    },
    // Получение пользователей-диспетчеров
    dispatcherUsers: async (_, { pagination }, context) => {
      await allMiddleware(context) // MIDDLEWARE_REVIEW: allMiddleware
      const { skip = 0, take = 10, all, search, category } = pagination
      const searchFilter = search
        ? {
            OR: [{ user: { name: { contains: search, mode: "insensitive" } } }]
          }
        : null
      const categoryFilter = category
        ? {
            position: {
              category: category
            }
          }
        : null

      const filters = [
        { dispatcher: true, active: true },
        ...(searchFilter ? [searchFilter] : []),
        ...(categoryFilter ? [categoryFilter] : [])
      ]
      const where = {
        AND: filters
      }

      const totalCount = await prisma.user.count({ where })

      const users = all
        ? prisma.user.findMany({
            where,
            orderBy: { name: "asc" },
            include: { position: true }
          })
        : prisma.user.findMany({
            where,
            skip: skip ? skip * take : undefined,
            take: take || undefined,
            orderBy: { name: "asc" },
            include: { position: true }
          })
      const totalPages = take && !all ? Math.ceil(totalCount / take) : 1
      return { users, totalCount, totalPages }
    },
    // Получение одного пользователя по его ID
    user: async (_, { userId }, context) => {
      await allMiddleware(context) // MIDDLEWARE_REVIEW: allMiddleware
      return prisma.user.findUnique({
        where: { id: userId },
        include: { position: true }
      })
    }
  },

  Mutation: {
    // Регистрация пользователя (используется админами отелей/авиакомпаний)
    registerUser: async (_, { input, images }, context) => {
      // Проверка прав: доступ разрешен только администраторам отелей/авиакомпаний
      await adminHotelAirMiddleware(context)

      const {
        name,
        email,
        login,
        password,
        role,
        userType,
        positionId,
        hotelId,
        airlineId,
        dispatcher,
        airlineDepartmentId,
        dispatcherDepartmentId,
        representativeDepartmentId
      } = input
      const loginNormalized = normalizeUserLogin(login)
      const { finalRole, finalUserType } = resolveRoleAndUserType({
        role,
        userType
      })

      // Проверка прав доступа для назначения отдела диспетчера
      if (
        dispatcherDepartmentId !== undefined &&
        dispatcherDepartmentId !== null
      ) {
        await dispatcherOrSuperAdminMiddleware(context)

        // Проверяем, что пользователь будет диспетчером или суперадмином
        const isDispatcher = dispatcher === true
        const isSuperAdmin = finalRole === "SUPERADMIN"

        if (!isSuperAdmin && !isDispatcher) {
          throw new Error(
            "Пользователь должен быть диспетчером (dispatcher = true) или суперадмином для назначения в отдел диспетчеров"
          )
        }

        // Проверяем существование и активность отдела
        const department = await prisma.dispatcherDepartment.findUnique({
          where: { id: dispatcherDepartmentId }
        })
        if (!department || !department.active) {
          throw new Error("Отдел диспетчеров не найден или неактивен")
        }
      }

      if (
        representativeDepartmentId !== undefined &&
        representativeDepartmentId !== null
      ) {
        await representativeMiddleware(context)

        if (finalRole !== ROLE.REPRESENTATIVE) {
          throw new Error(
            "Пользователь должен иметь роль REPRESENTATIVE для назначения в отдел представителей"
          )
        }

        const department = await prisma.representativeDepartment.findUnique({
          where: { id: representativeDepartmentId }
        })
        if (!department || !department.active) {
          throw new Error("Отдел представителей не найден или неактивен")
        }
      }

      // Хэширование пароля с помощью argon2
      const hashedPassword = await argon2.hash(password)

      // Проверяем, существует ли пользователь с таким email или login
      const existingUser = await prisma.user.findFirst({
        where: {
          OR: [
            { email },
            { login: { equals: loginNormalized, mode: "insensitive" } }
          ]
        }
      })

      if (existingUser) {
        const existingLoginNorm = normalizeUserLogin(existingUser.login)
        if (existingUser.email === email && existingLoginNorm === loginNormalized) {
          throw new Error(
            "Пользователь с таким email и логином уже существует",
            "USER_EXISTS"
          )
        } else if (existingUser.email === email) {
          throw new Error(
            "Пользователь с таким email уже существует",
            "EMAIL_EXISTS"
          )
        } else if (existingLoginNorm === loginNormalized) {
          throw new Error(
            "Пользователь с таким логином уже существует",
            "LOGIN_EXISTS"
          )
        }
      }

      // Обработка загрузки изображений: загружаем каждое изображение и сохраняем пути
      let imagePaths = []
      if (images && images.length > 0) {
        for (const image of images) {
          imagePaths.push(await uploadImage(image, { bucket: "user" }))
        }
      }

      // dispatcherDepartment и airlineDepartment взаимоисключающие — приоритет у dispatcherDepartment
      let finalDispatcherDeptId = null
      let finalRepresentativeDeptId = null
      let finalAirlineDeptId = null
      if (
        dispatcherDepartmentId !== undefined &&
        dispatcherDepartmentId !== null
      ) {
        finalDispatcherDeptId = dispatcherDepartmentId
      } else if (
        representativeDepartmentId !== undefined &&
        representativeDepartmentId !== null
      ) {
        finalRepresentativeDeptId = representativeDepartmentId
      } else if (
        airlineDepartmentId !== undefined &&
        airlineDepartmentId !== null
      ) {
        finalAirlineDeptId = airlineDepartmentId
      }

      // Формирование данных для создания нового пользователя
      const createdData = {
        name,
        email,
        login: loginNormalized,
        password: hashedPassword,
        hotelId: hotelId || undefined,
        airlineId: airlineId || undefined,
        role: finalRole,
        userType: finalUserType,
        positionId,
        dispatcher: dispatcher || false,
        airlineDepartmentId: finalAirlineDeptId,
        dispatcherDepartmentId: finalDispatcherDeptId,
        representativeDepartmentId: finalRepresentativeDeptId,
        images: imagePaths
      }

      // Создаем пользователя в базе данных
      const newUser = await prisma.user.create({
        data: createdData
      })

      // (Опционально) Отправка email с данными аккаунта (закомментировано)
      try {
        const info = await transporter.sendMail({
          from: `${process.env.EMAIL_USER}`,
          to: `${createdData.email}`,
          subject: "Данные вашего аккаунта",
          text: `Ваш логин: ${createdData.login} \n Ваш пароль: ${password}`
        })
      } catch (error) {
        console.error("Ошибка при отправке письма:", error)
      }

      // Логирование действия создания пользователя
      await logAction({
        context,
        action: "create_user",
        description: "Пользователь создан",
        fulldescription: `Пользователь ${context.user.name} добавил нового пользователя ${createdData.name}`,
        newData: {
          id: newUser.id,
          name: newUser.name,
          role: newUser.role,
          hotelId: newUser.hotelId,
          airlineId: newUser.airlineId,
          dispatcher: newUser.dispatcher
        }
      })

      // Публикация события о создании пользователя для подписок
      pubsub.publish(USER_CREATED, { userCreated: newUser })
      return newUser
    },

    // Регистрация (signUp) нового пользователя самостоятельно
    signUp: async (_, { input, images }) => {
      // Обработка загрузки изображений
      let imagePaths = []
      if (images && images.length > 0) {
        for (const image of images) {
          imagePaths.push(await uploadImage(image, { bucket: "user" }))
        }
      }

      // Генерация секрета для двухфакторной аутентификации (2FA)
      const twoFASecret = speakeasy.generateSecret().base32
      const { name, email, login, password, role, userType } = input
      const loginNormalized = normalizeUserLogin(login)
      const { finalRole, finalUserType } = resolveRoleAndUserType({
        role,
        userType
      })
      const hashedPassword = await argon2.hash(password)

      // Проверка на существование пользователя с таким email или login
      const existingUser = await prisma.user.findFirst({
        where: {
          OR: [
            { email },
            { login: { equals: loginNormalized, mode: "insensitive" } }
          ]
        }
      })

      if (existingUser) {
        const existingLoginNorm = normalizeUserLogin(existingUser.login)
        if (existingUser.email === email && existingLoginNorm === loginNormalized) {
          throw new Error(
            "Пользователь с таким email и логином уже существует",
            "USER_EXISTS"
          )
        } else if (existingUser.email === email) {
          throw new Error(
            "Пользователь с таким email уже существует",
            "EMAIL_EXISTS"
          )
        } else if (existingLoginNorm === loginNormalized) {
          throw new Error(
            "Пользователь с таким логином уже существует",
            "LOGIN_EXISTS"
          )
        }
      }

      // Создание нового пользователя с сохранением 2FA-секрета
      const newUser = await prisma.user.create({
        data: {
          name,
          email,
          login: loginNormalized,
          password: hashedPassword,
          role: finalRole,
          userType: finalUserType,
          images: imagePaths,
          twoFASecret
        }
      })

      const sessionToken = uuidv4()
      await prisma.user.update({
        where: { id: newUser.id },
        data: { refreshToken: sessionToken, fingerprint: null }
      })

      // Генерация токена доступа с помощью jwt
      const token = jwt.sign(
        {
          subjectType: "USER",
          userId: newUser.id,
          role: newUser.role,
          hotelId: newUser.hotelId,
          airlineId: newUser.airlineId,
          sessionToken
        },
        process.env.JWT_SECRET,
        { expiresIn: "24h" }
      )

      pubsub.publish(USER_CREATED, { userCreated: newUser })

      // Возвращаем пользователя вместе с токеном
      return {
        ...newUser,
        token
      }
    },

    // Аутентификация (signIn) пользователя
    signIn: async (_, { input }) => {
      const { login, password, fingerprint, token2FA } = input
      const identifier = normalizeUserLogin(login)
      if (!identifier) {
        throw new Error("Invalid credentials")
      }
      // Логин или email в одном поле (без учёта регистра)
      const user = await prisma.user.findFirst({
        where: {
          OR: [
            { login: { equals: identifier, mode: "insensitive" } },
            { email: { equals: identifier, mode: "insensitive" } }
          ]
        }
      })
      if (!user) {
        throw new Error("Invalid credentials")
      }
      // Проверка корректности пароля с помощью argon2.verify
      if (!user.active) {
        throw new Error("User is not active")
      }

      if (!(await argon2.verify(user.password, password))) {
        throw new Error("Invalid credentials")
      }
      // Если у пользователя включена двухфакторная аутентификация, проверяем токен 2FA
      if (user.is2FAEnabled) {
        let verified
        if (user.twoFAMethod === "TOTP") {
          verified = speakeasy.totp.verify({
            secret: user.twoFASecret,
            encoding: "base32",
            token: token2FA
          })
        } else if (user.twoFAMethod === "HOTP") {
          verified = speakeasy.hotp.verify({
            secret: user.twoFASecret,
            encoding: "base32",
            token: token2FA,
            counter: 0
          })
        }
        if (!verified) {
          throw new Error("Invalid 2FA token")
        }
      }
      // Новый sessionToken инвалидирует предыдущие access-токены этого пользователя.
      const sessionToken = uuidv4()
      const now = new Date()
      const { addedMinutes, nextDailyStats } = buildClosedSessionStats({
        sessionStartedAt: user.sessionStartedAt,
        currentDailyStats: user.dailyTimeStats || [],
        now
      })

      const updatedUser = await prisma.user.update({
        where: { id: user.id },
        data: {
          refreshToken: sessionToken,
          fingerprint,
          lastSeen: now,
          isOnline: true,
          sessionStartedAt: now,
          totalTimeMinutes: (user.totalTimeMinutes || 0) + addedMinutes,
          dailyTimeStats: nextDailyStats
        }
      })
      pubsub.publish(USER_ONLINE, { userOnline: updatedUser })

      return buildUserAuthPayload({ user: updatedUser, sessionToken })
    },

    // Обновление данных пользователя. Разрешено либо админам, либо самому пользователю.
    updateUser: async (_, { input, images }, context) => {
      const {
        id,
        name,
        email,
        number,
        login,
        password,
        oldPassword, // Предыдущее значение пароля (для проверки при смене)
        role,
        userType,
        positionId,
        hotelId,
        airlineId,
        airlineDepartmentId,
        dispatcherDepartmentId,
        representativeDepartmentId
      } = input
      // Если обновляет не сам пользователь, разрешено только админам
      if (context.user.id !== id && (await adminHotelAirMiddleware(context))) {
        throw new Error("Access forbidden: Admins only or self-update allowed.")
      }
      // Получаем текущие данные пользователя из базы
      const currentUser = await prisma.user.findUnique({ where: { id } })

      // Проверка прав доступа для изменения отдела диспетчера
      if (dispatcherDepartmentId !== undefined) {
        await dispatcherOrSuperAdminMiddleware(context)

        // Проверяем, что пользователь, которому назначается отдел, является диспетчером или суперадмином
        if (
          currentUser.role !== "SUPERADMIN" &&
          currentUser.dispatcher !== true
        ) {
          throw new Error(
            "Пользователь должен быть диспетчером или суперадмином для назначения в отдел диспетчеров"
          )
        }

        // Если отдел указан, проверяем его существование
        if (dispatcherDepartmentId !== null) {
          const department = await prisma.dispatcherDepartment.findUnique({
            where: { id: dispatcherDepartmentId }
          })
          if (!department || !department.active) {
            throw new Error("Отдел диспетчеров не найден или неактивен")
          }
        }
      }

      if (representativeDepartmentId !== undefined) {
        await representativeMiddleware(context)

        const nextRole = role ?? currentUser.role
        if (nextRole !== ROLE.REPRESENTATIVE) {
          throw new Error(
            "Пользователь должен иметь роль REPRESENTATIVE для назначения в отдел представителей"
          )
        }

        if (representativeDepartmentId !== null) {
          const department = await prisma.representativeDepartment.findUnique({
            where: { id: representativeDepartmentId }
          })
          if (!department || !department.active) {
            throw new Error("Отдел представителей не найден или неактивен")
          }
        }
      }

      // Формируем объект обновления, добавляя только те поля, которые заданы
      const updatedData = {}
      if (name !== undefined) updatedData.name = name
      if (email !== undefined) updatedData.email = email
      if (number !== undefined) updatedData.number = number
      if (login !== undefined) {
        const loginNormalized = normalizeUserLogin(login)
        const taken = await prisma.user.findFirst({
          where: {
            id: { not: id },
            login: { equals: loginNormalized, mode: "insensitive" }
          }
        })
        if (taken) {
          throw new Error("Пользователь с таким логином уже существует")
        }
        updatedData.login = loginNormalized
      }
      if (role !== undefined) {
        // Разрешаем изменение роли только администраторам
        if (role !== currentUser.role) {
          await adminHotelAirMiddleware(context)
          updatedData.role = role
        }
      }
      if (userType !== undefined) {
        if (userType !== currentUser.userType) {
          await adminHotelAirMiddleware(context)
          updatedData.userType = userType
        }
      }
      if (positionId !== undefined) updatedData.positionId = positionId
      if (hotelId !== undefined) updatedData.hotelId = hotelId
      if (airlineId !== undefined) updatedData.airlineId = airlineId
      // dispatcherDepartment, representativeDepartment и airlineDepartment взаимоисключающие
      if (dispatcherDepartmentId !== undefined) {
        updatedData.dispatcherDepartmentId = dispatcherDepartmentId
        updatedData.representativeDepartmentId = null
        updatedData.airlineDepartmentId = null
      } else if (representativeDepartmentId !== undefined) {
        updatedData.representativeDepartmentId = representativeDepartmentId
        updatedData.dispatcherDepartmentId = null
        updatedData.airlineDepartmentId = null
      } else if (airlineDepartmentId !== undefined) {
        updatedData.airlineDepartmentId = airlineDepartmentId
        updatedData.dispatcherDepartmentId = null
        updatedData.representativeDepartmentId = null
      }

      // Обработка загрузки новых изображений
      if (images && images.length > 0) {
        let imagePaths = []
        for (const image of images) {
          imagePaths.push(await uploadImage(image, { bucket: "user" }))
        }
        updatedData.images = imagePaths
      }

      // Обработка смены пароля: если передан новый пароль, требуется проверить старый
      if (password) {
        if (!oldPassword) {
          throw new Error(
            "Для обновления пароля необходимо указать предыдущий пароль."
          )
        }
        // Проверяем, что oldPassword совпадает с текущим паролем
        const valid = await argon2.verify(currentUser.password, oldPassword)
        if (!valid) {
          throw new Error("Указан неверный пароль.")
        }
        // Хэшируем новый пароль и добавляем в объект обновления
        const hashedPassword = await argon2.hash(password)
        updatedData.password = hashedPassword
      }

      const nextRole = updatedData.role ?? currentUser.role
      const nextUserTypeInput = updatedData.userType ?? currentUser.userType
      const { finalUserType: syncedUserType } = resolveRoleAndUserType({
        role: nextRole,
        userType: nextUserTypeInput,
        fallbackRole: currentUser.role
      })
      updatedData.userType = syncedUserType

      // Обновляем пользователя в базе данных
      const updatedUser = await prisma.user.update({
        where: { id },
        data: updatedData
      })

      // Публикуем событие создания/обновления пользователя
      pubsub.publish(USER_CREATED, { userCreated: updatedUser })
      return updatedUser
    },

    // Мутация для запроса восстановления пароля.
    // Ищется пользователь по email, генерируется токен сброса, обновляются поля в базе и отправляется email.
    requestResetPassword: async (_, { email }, context) => {
      // Ищем пользователя по email
      const user = await prisma.user.findUnique({ where: { email } })
      // Для безопасности возвращаем одно и то же сообщение, независимо от результата
      const message = "Инструкции отправлены на указанный email."
      if (!user) {
        return message
      }

      // Генерируем уникальный токен и устанавливаем срок действия (1 час)
      const token = uuidv4()
      const expires = new Date(Date.now() + 60 * 60 * 1000)

      // Обновляем данные пользователя, сохраняя токен и его срок действия
      await prisma.user.update({
        where: { id: user.id },
        data: {
          resetPasswordToken: token,
          resetPasswordExpires: expires
        }
      })

      // Отправляем письмо с инструкциями по сбросу пароля
      await sendResetPasswordEmail(user.email, token)

      return message
    },

    // Мутация для сброса пароля с использованием токена восстановления.
    resetPassword: async (_, { token, newPassword }, context) => {
      if (!token || !newPassword) {
        throw new Error("Неверные данные")
      }

      // Ищем пользователя по токену, проверяя, что срок действия не истек
      const user = await prisma.user.findFirst({
        where: {
          resetPasswordToken: token,
          resetPasswordExpires: { gte: new Date() }
        }
      })

      if (!user) {
        throw new Error("Неверный или просроченный токен")
      }

      const hashedPassword = await argon2.hash(newPassword)

      // Обновляем пароль и очищаем поля токена сброса
      await prisma.user.update({
        where: { id: user.id },
        data: {
          password: hashedPassword,
          resetPasswordToken: null,
          resetPasswordExpires: null
        }
      })

      return "Пароль успешно обновлен."
    },

    // Включение двухфакторной аутентификации (2FA) для текущего пользователя.
    // Генерируется секрет, сохраняется в базе, а для TOTP возвращается QR-код.
    enable2FA: async (_, { input }, context) => {
      await allMiddleware(context) // MIDDLEWARE_REVIEW: allMiddleware
      if (!context.user) throw new Error("Unauthorized")
      let method = input.method
      // Генерация секрета для 2FA
      const twoFASecret = speakeasy.generateSecret().base32
      // Если выбран метод HOTP, генерируем одноразовый токен и отправляем его на email
      if (method === "HOTP") {
        const token = speakeasy.hotp({
          secret: twoFASecret,
          encoding: "base32",
          counter: 0
        })
        try {
          const mailOptions = {
            // from: `${process.env.EMAIL_USER}`,
            to: `${context.user.email}`,
            subject: "Your HOTP Code",
            html: `Your HOTP code is <b>${token}</b>`
          }
          // await transporter.sendMail(mailOptions)
          await sendEmail(mailOptions)
        } catch (error) {
          console.error("Ошибка при отправке письма:", error)
        }
      }
      // Обновляем данные пользователя: сохраняем секрет, метод 2FA и включаем 2FA
      await prisma.user.update({
        where: { id: context.user.id },
        data: { twoFASecret, twoFAMethod: method, is2FAEnabled: true }
      })
      if (method === "TOTP") {
        // Генерируем otpauth URL и преобразуем его в QR-код
        const otpauthUrl = speakeasy.otpauthURL({
          secret: twoFASecret,
          label: `KarsAvia (${context.user.email})`,
          algorithm: "sha256"
        })
        const qrCodeUrl = await qrcode.toDataURL(otpauthUrl)
        return { qrCodeUrl }
      }
      return { qrCodeUrlL: null }
    },

    // Верификация 2FA токена для текущего пользователя.
    verify2FA: async (_, { token }, context) => {
      await allMiddleware(context) // MIDDLEWARE_REVIEW: allMiddleware
      if (!context.user) throw new Error("Unauthorized")
      const user = await prisma.user.findUnique({
        where: { id: context.user.id }
      })
      let verified
      if (user.twoFAMethod === "TOTP") {
        verified = speakeasy.totp.verify({
          secret: user.twoFASecret,
          encoding: "base32",
          token
        })
      } else if (user.twoFAMethod === "HOTP") {
        verified = speakeasy.hotp.verify({
          secret: user.twoFASecret,
          encoding: "base32",
          token,
          counter: 0
        })
      }
      if (!verified) throw new Error("Invalid 2FA token")
      return { success: true }
    },

    // Обновление (refresh) токенов аутентификации.
    // На основании действующего refreshToken генерируется новый accessToken и новый refreshToken.
    refreshToken: async (_, { refreshToken, fingerprint }) => {
      const [user, driver, airlinePersonal] = await Promise.all([
        prisma.user.findFirst({ where: { refreshToken } }),
        prisma.driver.findFirst({ where: { refreshToken } }),
        prisma.airlinePersonal.findFirst({ where: { refreshToken } })
      ])

      const candidates = [
        user ? { subjectType: "USER", entity: user } : null,
        driver ? { subjectType: "DRIVER", entity: driver } : null,
        airlinePersonal
          ? { subjectType: "AIRLINE_PERSONAL", entity: airlinePersonal }
          : null
      ].filter(Boolean)

      if (!candidates.length) {
        throw new Error("Invalid refresh token")
      }

      if (candidates.length > 1) {
        throw new Error("Ambiguous refresh token")
      }

      const { subjectType, entity } = candidates[0]

      const normalizedFingerprint =
        typeof fingerprint === "string" ? fingerprint.trim() : ""

      if (entity.fingerprint && normalizedFingerprint !== entity.fingerprint) {
        throw new Error("Invalid fingerprint")
      }

      const newSessionToken = uuidv4()
      let jwtPayload = {
        subjectType,
        sessionToken: newSessionToken
      }

      if (subjectType === "USER") {
        const updateData = { refreshToken: newSessionToken }
        if (!entity.fingerprint && normalizedFingerprint) {
          updateData.fingerprint = normalizedFingerprint
        }
        await prisma.user.update({
          where: { id: entity.id },
          data: updateData
        })
        jwtPayload = {
          ...jwtPayload,
          userId: entity.id,
          role: entity.role,
          hotelId: entity.hotelId,
          airlineId: entity.airlineId,
          airlineDepartmentId: entity.airlineDepartmentId,
          dispatcherDepartmentId: entity.dispatcherDepartmentId,
          representativeDepartmentId: entity.representativeDepartmentId
        }
      }

      if (subjectType === "DRIVER") {
        const updateData = { refreshToken: newSessionToken }
        if (!entity.fingerprint && normalizedFingerprint) {
          updateData.fingerprint = normalizedFingerprint
        }
        await prisma.driver.update({
          where: { id: entity.id },
          data: updateData
        })
        jwtPayload = {
          ...jwtPayload,
          driverId: entity.id,
          role: entity.role || "DRIVER",
          organizationId: entity.organizationId,
          registrationStatus: entity.registrationStatus
        }
      }

      if (subjectType === "AIRLINE_PERSONAL") {
        const updateData = { refreshToken: newSessionToken }
        if (!entity.fingerprint && normalizedFingerprint) {
          updateData.fingerprint = normalizedFingerprint
        }
        await prisma.airlinePersonal.update({
          where: { id: entity.id },
          data: updateData
        })
        jwtPayload = {
          ...jwtPayload,
          airlinePersonalId: entity.id,
          role: entity.role,
          airlineId: entity.airlineId,
          departmentId: entity.departmentId
        }
      }

      const newAccessToken = jwt.sign(jwtPayload, process.env.JWT_SECRET, {
        expiresIn: "24h"
      })

      return {
        id: entity.id,
        name: entity.name,
        number: entity.number,
        email: entity.email,
        role: entity.role,
        token: newAccessToken,
        refreshToken: newSessionToken
      }
    },

    // Выход (logout) пользователя: очищается refreshToken в базе.
    logout: async (_, __, context) => {
      await allMiddleware(context) // MIDDLEWARE_REVIEW: allMiddleware
      if (!context.user) throw new Error("Not authenticated")
      const now = new Date()
      const currentUser = await prisma.user.findUnique({
        where: { id: context.user.id },
        select: {
          totalTimeMinutes: true,
          sessionStartedAt: true,
          dailyTimeStats: true
        }
      })

      const updatedUser = await prisma.user.update({
        where: { id: context.user.id },
        data: {
          refreshToken: null,
          fingerprint: null,
          ...buildOfflineUpdateData({ currentUser, now })
        }
      })
      pubsub.publish(USER_ONLINE, { userOnline: updatedUser })
      return { message: "Logged out successfully" }
    },
    markUserOnline: async (_, __, context) => {
      await allMiddleware(context) // MIDDLEWARE_REVIEW: allMiddleware
      const now = new Date()

      const currentUser = await prisma.user.findUnique({
        where: { id: context.user.id },
        select: { sessionStartedAt: true }
      })

      const updatedUser = await prisma.user.update({
        where: { id: context.user.id },
        data: {
          isOnline: true,
          lastSeen: now,
          sessionStartedAt: currentUser?.sessionStartedAt || now
        }
      })

      pubsub.publish(USER_ONLINE, { userOnline: updatedUser })
      return updatedUser
    },
    markUserOffline: async (_, __, context) => {
      await allMiddleware(context) // MIDDLEWARE_REVIEW: allMiddleware
      const now = new Date()

      const currentUser = await prisma.user.findUnique({
        where: { id: context.user.id },
        select: {
          totalTimeMinutes: true,
          sessionStartedAt: true,
          dailyTimeStats: true
        }
      })

      const updatedUser = await prisma.user.update({
        where: { id: context.user.id },
        data: buildOfflineUpdateData({ currentUser, now })
      })

      pubsub.publish(USER_ONLINE, { userOnline: updatedUser })
      return updatedUser
    },

    // Удаление пользователя.
    // Производится проверка наличия пользователя, его роли (SUPERADMIN удалять нельзя),
    // а также дополнительные проверки по принадлежности к авиакомпании или отелю.
    deleteUser: async (_, { id }, context) => {
      const { user } = context
      const userForDelete = await prisma.user.findUnique({
        where: { id }
      })
      if (!userForDelete) {
        throw new Error("User not found")
      }

      // Нельзя удалять супер-администратора
      if (userForDelete.role === "SUPERADMIN") {
        throw new Error("Access forbidden")
      }

      // Если пользователь привязан к авиакомпании – проверяем права авиадминистратора
      if (userForDelete.airlineId) {
        await airlineAdminMiddleware(context)
        if (userForDelete.images && userForDelete.images.length > 0) {
          for (const imagePath of userForDelete.images) {
            await deleteImage(imagePath)
          }
        }
        return await prisma.user.update({
          where: { id },
          data: {
            active: false
          }
        })
      }

      // Если пользователь привязан к отелю – проверяем права отельного администратора
      if (userForDelete.hotelId) {
        await hotelAdminMiddleware(context)
        if (userForDelete.images && userForDelete.images.length > 0) {
          for (const imagePath of userForDelete.images) {
            await deleteImage(imagePath)
          }
        }
        return await prisma.user.update({
          where: { id },
          data: {
            active: false
          }
        })
      }

      // Если пользователь является диспетчером, требуется административный доступ
      if (userForDelete.dispatcher) {
        await adminMiddleware(context)
        if (userForDelete.images && userForDelete.images.length > 0) {
          for (const imagePath of userForDelete.images) {
            await deleteImage(imagePath)
          }
        }
        return await prisma.user.update({
          where: { id },
          data: {
            active: false
          }
        })
      }
    }
  },

  Subscription: {
    // Подписка на событие создания нового пользователя
    userCreated: {
      subscribe: withFilter(
        () => pubsub.asyncIterator([USER_CREATED]),
        async (payload, variables, context) => {
          if (
            !(await subscriptionAuthMiddleware(
              allMiddleware,
              context,
              "user.Subscription"
            ))
          ) {
            return false
          }
          const { subject, subjectType } = context

          if (!subject || subjectType !== "USER") return false

          // Только SUPERADMIN и диспетчеры видят создание пользователей
          return subject.role === "SUPERADMIN" || subject.dispatcher === true
        }
      )
    },
    userOnline: {
      subscribe: withFilter(
        () => pubsub.asyncIterator([USER_ONLINE]),
        async (payload, variables, context) => {
          if (
            !(await subscriptionAuthMiddleware(
              allMiddleware,
              context,
              "user.Subscription"
            ))
          ) {
            return false
          }
          const { subject, subjectType } = context

          if (!subject || subjectType !== "USER") return false

          // SUPERADMIN и диспетчеры видят всех
          if (subject.role === "SUPERADMIN" || subject.dispatcher === true) {
            return true
          }

          // Пользователи видят статус пользователей своей авиакомпании/отеля
          const user = payload.userOnline
          if (subject.airlineId && user.airlineId === subject.airlineId) {
            return true
          }
          if (subject.hotelId && user.hotelId === subject.hotelId) {
            return true
          }

          return false
        }
      )
    }
  },
  User: {
    position: async (parent) => {
      if (parent.positionId) {
        return await prisma.position.findUnique({
          where: { id: parent.positionId }
        })
      }
      return null
    },
    online: async (parent) => {
      if (typeof parent.isOnline === "boolean") {
        return parent.isOnline
      }

      const user = await prisma.user.findUnique({
        where: { id: parent.id },
        select: { isOnline: true, lastSeen: true }
      })

      if (user?.isOnline) return true
      if (!user?.lastSeen) return false

      const lastSeenDate =
        user.lastSeen instanceof Date ? user.lastSeen : new Date(user.lastSeen)

      const now = new Date()

      const fiveMinutesInMs = 5 * 60 * 1000
      const lastSeenPlus5 = new Date(lastSeenDate.getTime() + fiveMinutesInMs)

      return now <= lastSeenPlus5
    },
    dailyTimeStats: (parent) => {
      if (!Array.isArray(parent.dailyTimeStats)) return []
      return parent.dailyTimeStats.map((item) => ({
        date: item.date,
        minutes: item.minutes || 0,
        hours: Number(((item.minutes || 0) / 60).toFixed(2))
      }))
    },
    airline: async (parent) => {
      if (parent.airlineId) {
        return await prisma.airline.findUnique({
          where: { id: parent.airlineId }
        })
      }
      return null
    }
  }
}

export default userResolver
