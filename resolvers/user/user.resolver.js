// Импорт необходимых модулей и утилит
import { prisma } from "../../prisma.js"
import argon2 from "argon2"
import jwt from "jsonwebtoken"
import GraphQLUpload from "graphql-upload/GraphQLUpload.mjs"
import { uploadImage, deleteImage } from "../../exports/uploadImage.js"
import logAction from "../../exports/logaction.js"
import {
  adminHotelAirMiddleware,
  adminMiddleware,
  airlineAdminMiddleware,
  hotelAdminMiddleware
} from "../../middlewares/authMiddleware.js"
import speakeasy from "@levminer/speakeasy"
import qrcode from "qrcode"
import nodemailer from "nodemailer"
import { v4 as uuidv4 } from "uuid"
import bcrypt from "bcrypt"
import { pubsub, USER_CREATED } from "../../exports/pubsub.js"
import { SubscriptionClient } from "subscriptions-transport-ws"

// Создаем транспортёр для отправки email с использованием SMTP
const transporter = nodemailer.createTransport({
  host: "smtp.mail.ru",
  port: 465,
  secure: true,
  auth: {
    user: process.env.EMAIL_USER,
    pass: process.env.EMAIL_PASSWORD
  }
})

// Основной объект-резольвер для работы с пользователями (userResolver)
const userResolver = {
  // Подключаем тип Upload для поддержки загрузки файлов через GraphQL
  Upload: GraphQLUpload,

  Query: {
    // Получение всех пользователей, сортированных по имени (возвращает всех)
    users: async (_, __, context) => {
      return prisma.user.findMany({ orderBy: { name: "asc" } })
    },
    // Получение пользователей, привязанных к конкретной авиакомпании по airlineId
    airlineUsers: async (_, { airlineId }, context) => {
      return prisma.user.findMany({
        where: { airlineId },
        orderBy: { name: "asc" }
      })
    },
    // Получение пользователей, привязанных к конкретному отелю по hotelId
    hotelUsers: async (_, { hotelId }, context) => {
      return prisma.user.findMany({
        where: { hotelId },
        orderBy: { name: "asc" }
      })
    },
    // Получение пользователей-диспетчеров
    dispatcherUsers: async (_, __, context) => {
      return prisma.user.findMany({
        where: { dispatcher: true },
        orderBy: { name: "asc" }
      })
    },
    // Получение одного пользователя по его ID
    user: async (_, { userId }, context) => {
      return prisma.user.findUnique({
        where: { id: userId }
      })
    }
  },

  Mutation: {
    // Регистрация пользователя (используется админами отелей/авиакомпаний)
    registerUser: async (_, { input, images }, context) => {
      // Проверка прав: доступ разрешен только администраторам отелей/авиакомпаний
      adminHotelAirMiddleware(context)

      const {
        name,
        email,
        login,
        password,
        role,
        position,
        hotelId,
        airlineId,
        dispatcher,
        airlineDepartmentId
      } = input
      // Хэширование пароля с помощью argon2
      const hashedPassword = await argon2.hash(password)

      // Проверяем, существует ли пользователь с таким email или login
      const existingUser = await prisma.user.findFirst({
        where: {
          OR: [{ email }, { login }]
        }
      })

      if (existingUser) {
        if (existingUser.email === email && existingUser.login === login) {
          throw new Error(
            "Пользователь с таким email и логином уже существует",
            "USER_EXISTS"
          )
        } else if (existingUser.email === email) {
          throw new Error(
            "Пользователь с таким email уже существует",
            "EMAIL_EXISTS"
          )
        } else if (existingUser.login === login) {
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
          imagePaths.push(await uploadImage(image))
        }
      }

      // Формирование данных для создания нового пользователя
      const createdData = {
        name,
        email,
        login,
        password: hashedPassword,
        hotelId: hotelId || undefined,
        airlineId: airlineId || undefined,
        role: role || "USER",
        position,
        dispatcher: dispatcher || false,
        airlineDepartmentId: airlineDepartmentId || null,
        images: imagePaths
      }

      // Создаем пользователя в базе данных
      const newUser = await prisma.user.create({
        data: createdData
      })

      // (Опционально) Отправка email с данными аккаунта (закомментировано)
      // try {
      //   const info = await transporter.sendMail({
      //     from: `${process.env.EMAIL_USER}`,
      //     to: `${createdData.email}`,
      //     subject: "Данные вашего аккаунта",
      //     text: `Ваш логин: ${createdData.login} \n Ваша почта: ${createdData.email} \n Ваш пароль: ${password}`
      //   })
      // } catch (error) {
      //   console.error("Ошибка при отправке письма:", error)
      // }

      // Логирование действия создания пользователя
      await logAction({
        context,
        action: "create_user",
        description: `Пользователь ${context.user.name} добавил нового пользователя ${createdData.name}`
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
          imagePaths.push(await uploadImage(image))
        }
      }

      // Генерация секрета для двухфакторной аутентификации (2FA)
      const twoFASecret = speakeasy.generateSecret().base32
      const { name, email, login, password, role } = input
      const hashedPassword = await argon2.hash(password)

      // Проверка на существование пользователя с таким email или login
      const existingUser = await prisma.user.findFirst({
        where: {
          OR: [{ email }, { login }]
        }
      })

      if (existingUser) {
        if (existingUser.email === email && existingUser.login === login) {
          throw new Error(
            "Пользователь с таким email и логином уже существует",
            "USER_EXISTS"
          )
        } else if (existingUser.email === email) {
          throw new Error(
            "Пользователь с таким email уже существует",
            "EMAIL_EXISTS"
          )
        } else if (existingUser.login === login) {
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
          login,
          password: hashedPassword,
          role: role || "USER",
          images: imagePaths,
          twoFASecret
        }
      })

      // Генерация токена доступа с помощью jwt
      const token = jwt.sign(
        {
          userId: newUser.id,
          role: newUser.role,
          hotelId: newUser.hotelId,
          airlineId: newUser.airlineId
        },
        process.env.JWT_SECRET,
        { expiresIn: "24d" }
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
      const { login, password, token2FA } = input
      // Ищем пользователя по логину
      const user = await prisma.user.findUnique({ where: { login } })
      // Проверка корректности пароля с помощью argon2.verify
      if (!user || !(await argon2.verify(user.password, password))) {
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
      // Генерация токена доступа
      const token = jwt.sign(
        {
          userId: user.id,
          role: user.role,
          hotelId: user.hotelId,
          airlineId: user.airlineId
        },
        process.env.JWT_SECRET,
        { expiresIn: "24d" }
      )
      return {
        ...user,
        token
      }
    },

    // Обновление данных пользователя. Разрешено либо админам, либо самому пользователю.
    updateUser: async (_, { input, images }, context) => {
      const {
        id,
        name,
        email,
        login,
        password,
        oldPassword, // Предыдущее значение пароля (для проверки при смене)
        role,
        position,
        hotelId,
        airlineId,
        airlineDepartmentId
      } = input
      console.log(input)
      // Если обновляет не сам пользователь, разрешено только админам
      if (context.user.id !== id && adminHotelAirMiddleware(context)) {
        throw new Error("Access forbidden: Admins only or self-update allowed.")
      }
      // Получаем текущие данные пользователя из базы
      const currentUser = await prisma.user.findUnique({ where: { id } })
      // Формируем объект обновления, добавляя только те поля, которые заданы
      const updatedData = {}
      if (name !== undefined) updatedData.name = name
      if (email !== undefined) updatedData.email = email
      if (login !== undefined) updatedData.login = login
      if (role !== undefined) {
        // Разрешаем изменение роли только администраторам
        if (role !== currentUser.role) {
          adminHotelAirMiddleware(context)
          updatedData.role = role
        }
      }
      if (position !== undefined) updatedData.position = position
      if (hotelId !== undefined) updatedData.hotelId = hotelId
      if (airlineId !== undefined) updatedData.airlineId = airlineId
      if (airlineDepartmentId !== undefined)
        updatedData.airlineDepartmentId = airlineDepartmentId

      // Обработка загрузки новых изображений
      if (images && images.length > 0) {
        let imagePaths = []
        for (const image of images) {
          imagePaths.push(await uploadImage(image))
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

      // Хэшируем новый пароль с использованием bcrypt
      const hashedPassword = await bcrypt.hash(newPassword, 10)

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
          const info = await transporter.sendMail({
            from: `${process.env.EMAIL_USER}`,
            to: `${context.user.email}`,
            subject: "Your HOTP Code",
            text: `Your HOTP code is ${token}`
          })
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
    refreshToken: async (_, { refreshToken }) => {
      const user = await prisma.user.findUnique({ where: { refreshToken } })
      if (!user) {
        throw new Error("Invalid refresh token")
      }
      const newAccessToken = jwt.sign(
        {
          userId: user.id,
          role: user.role
        },
        process.env.JWT_SECRET,
        { expiresIn: "24d" }
      )
      const newRefreshToken = uuidv4()
      await prisma.user.update({
        where: { id: user.id },
        data: { refreshToken: newRefreshToken }
      })
      return {
        token: newAccessToken,
        refreshToken: newRefreshToken
      }
    },

    // Выход (logout) пользователя: очищается refreshToken в базе.
    logout: async (_, __, context) => {
      if (!context.user) throw new Error("Not authenticated")
      await prisma.user.update({
        where: { id: context.user.id },
        data: { refreshToken: null }
      })
      return { message: "Logged out successfully" }
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
        airlineAdminMiddleware(context)
        if (userForDelete.images && userForDelete.images.length > 0) {
          for (const imagePath of userForDelete.images) {
            await deleteImage(imagePath)
          }
        }
        return await prisma.user.delete({
          where: { id }
        })
      }

      // Если пользователь привязан к отелю – проверяем права отельного администратора
      if (userForDelete.hotelId) {
        hotelAdminMiddleware(context)
        if (userForDelete.images && userForDelete.images.length > 0) {
          for (const imagePath of userForDelete.images) {
            await deleteImage(imagePath)
          }
        }
        return await prisma.user.delete({
          where: { id }
        })
      }

      // Если пользователь является диспетчером, требуется административный доступ
      if (userForDelete.dispatcher) {
        adminMiddleware(context)
        if (userForDelete.images && userForDelete.images.length > 0) {
          for (const imagePath of userForDelete.images) {
            await deleteImage(imagePath)
          }
        }
        return await prisma.user.delete({
          where: { id }
        })
      }
    }
  },

  Subscription: {
    // Подписка на событие создания нового пользователя
    userCreated: {
      subscribe: () => pubsub.asyncIterator([USER_CREATED])
    }
  }
}

// Функция для отправки письма восстановления пароля.
// Формируется ссылка для сброса пароля, которая действительна в течение 1 часа.
const sendResetPasswordEmail = async (userEmail, token) => {
  // Ссылка для сброса пароля (замените домен на нужный)
  const resetLink = `https://192.168.0.14/reset-password?token=${token}`

  const mailOptions = {
    from: `${process.env.EMAIL_USER}`,
    to: userEmail,
    subject: "Восстановление пароля",
    html: `<p>Чтобы сбросить пароль, перейдите по ссылке: <a href="${resetLink}">${resetLink}</a></p>
           <p>Ссылка действительна в течение 1 часа.</p>`
  }

  // Отправка письма через настроенный транспортёр
  await transporter.sendMail(mailOptions)
}

export default userResolver
