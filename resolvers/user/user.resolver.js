import { prisma } from "../../prisma.js"
import argon2 from "argon2"
import jwt from "jsonwebtoken"
import GraphQLUpload from "graphql-upload/GraphQLUpload.mjs"
import uploadImage from "../../exports/uploadImage.js"
import logAction from "../../exports/logaction.js"
import {
  adminHotelAirMiddleware,
  adminMiddleware
} from "../../middlewares/authMiddleware.js"
import speakeasy from "@levminer/speakeasy"
import qrcode from "qrcode"
import nodemailer from "nodemailer"
import { v4 as uuidv4 } from "uuid"
import { pubsub, USER_CREATED } from "../../exports/pubsub.js"
import { SubscriptionClient } from "subscriptions-transport-ws"

const transporter = nodemailer.createTransport({
  host: "smtp.mail.ru",
  port: 465,
  secure: true,
  auth: {
    user: process.env.EMAIL_USER,
    pass: process.env.EMAIL_PASSWORD
  }
})
const userResolver = {
  Upload: GraphQLUpload,
  // need middleware for Query and Mutations
  Query: {
    users: async (_, { __ }, context) => {
      return prisma.user.findMany({ orderBy: { name: "asc" } })
    },
    airlineUsers: async (_, { airlineId }, context) => {
      return prisma.user.findMany({
        where: {
          airlineId: airlineId
        },
        orderBy: { name: "asc" }
      })
    },
    hotelUsers: async (_, { hotelId }, context) => {
      return prisma.user.findMany({
        where: {
          hotelId: hotelId
        },
        orderBy: { name: "asc" }
      })
    },
    dispatcherUsers: async (_, { __ }, context) => {
      return prisma.user.findMany({
        where: {
          dispatcher: true
        },
        orderBy: { name: "asc" }
      })
    },
    user: async (_, { userId }, context) => {
      return prisma.user.findUnique({
        where: { id: userId }
      })
    }
  },
  Mutation: {
    registerUser: async (_, { input, images }, context) => {
      adminHotelAirMiddleware(context)
      let imagePaths = []
      if (images && images.length > 0 && images !== null) {
        for (const image of images) {
          imagePaths.push(await uploadImage(image))
        }
      }
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
      const hashedPassword = await argon2.hash(password)
      const createdData = {
        name,
        email,
        login,
        password: hashedPassword,
        hotelId: hotelId ? hotelId : undefined,
        airlineId: airlineId ? airlineId : undefined,
        role: role || "USER",
        position: position,
        dispatcher: dispatcher || false,
        airlineDepartmentId: airlineDepartmentId || null
      }
      if (images != null) {
        createdData.images = imagePaths
      }
      const newUser = await prisma.user.create({
        data: createdData
      })
      pubsub.publish(USER_CREATED, { userCreated: newUser })
      return newUser
    },
    signUp: async (_, { input, images }) => {
      let imagePaths = []
      if (images && images.length > 0) {
        for (const image of images) {
          imagePaths.push(await uploadImage(image))
        }
      }
      // -------- 2FA key generation -------- ↓↓↓↓
      const twoFASecret = speakeasy.generateSecret().base32
      const { name, email, login, password, role } = input
      const hashedPassword = await argon2.hash(password)
      const newUser = await prisma.user.create({
        data: {
          name,
          email,
          login,
          password: hashedPassword,
          role: role ? role : "USER",
          images: imagePaths,
          twoFASecret // ---- 2FA key ----
        }
      })
      const token = jwt.sign(
        {
          userId: newUser.id,
          role: newUser.role,
          hotelId: newUser.hotelId && newUser.hotelId,
          airlineId: newUser.airlineId && newUser.airlineId
        },
        process.env.JWT_SECRET,
        { expiresIn: "24d" }
      )
      pubsub.publish(USER_CREATED, { userCreated: newUser })
      return {
        ...newUser,
        token
      }
    },
    signIn: async (_, { input }) => {
      const { login, password, token2FA } = input
      const user = await prisma.user.findUnique({ where: { login } })
      if (!user || !(await argon2.verify(user.password, password))) {
        throw new Error("Invalid credentials")
      }
      // ---------------- 2FA ---------------- ↓↓↓↓
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
      // ---------------- 2FA ---------------- ↑↑↑↑
      // const refreshToken = uuidv4()
      // await prisma.user.update({
      //   where: { id: user.id },
      //   data: { refreshToken }
      // })
      const token = jwt.sign(
        {
          userId: user.id,
          role: user.role,
          hotelId: user.hotelId && user.hotelId,
          airlineId: user.airlineId && user.airlineId
        },
        process.env.JWT_SECRET,
        { expiresIn: "24d" }
      )
      return {
        ...user,
        token
      }
    },
    updateUser: async (_, { input, images }, context) => {
      const { id, name, email, login, password, position } = input

      if (context.user.id !== id && adminMiddleware(context)) {
        throw new Error("Access forbidden: Admins only or self-update allowed.")
      }

      let imagePaths = []
      if (images && images.length > 0 && images !== null) {
        for (const image of images) {
          imagePaths.push(await uploadImage(image))
        }
      }
      let hashedPassword
      if (password) {
        hashedPassword = await argon2.hash(password)
      }
      const updatedData = {
        name,
        email,
        login,
        position
      }
      if (images != null) {
        updatedData.images = imagePaths
      }
      if (hashedPassword) {
        updatedData.password = hashedPassword
      }
      const user = await prisma.user.update({
        where: { id: id },
        data: updatedData
      })
      // logAction(id, "update", user)
      return user
    },
    // -------------------------------- 2FA -------------------------------- ↓↓↓↓
    enable2FA: async (_, { input }, context) => {
      if (!context.user) throw new Error("Unauthorized")
      let method = input.method
      const twoFASecret = speakeasy.generateSecret().base32
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
      await prisma.user.update({
        where: { id: context.user.id },
        data: { twoFASecret, twoFAMethod: method, is2FAEnabled: true }
      })
      if (method === "TOTP") {
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
          token: token
        })
      } else if (user.twoFAMethod === "HOTP") {
        verified = speakeasy.hotp.verify({
          secret: user.twoFASecret,
          encoding: "base32",
          token: token,
          counter: 0
        })
      }
      if (!verified) throw new Error("Invalid 2FA token")
      return { success: true }
    },
    // -------------------------------- 2FA -------------------------------- ↑↑↑↑

    // ---------------------------------------------------------------- need changes
    refreshToken: async (_, { refreshToken }) => {
      const user = await prisma.user.findUnique({ where: { refreshToken } })
      if (!user) {
        throw new Error("Invalid refresh token")
      }
      // Генерируем новый access токен
      const newAccessToken = jwt.sign(
        {
          userId: user.id,
          role: user.role
        },
        process.env.JWT_SECRET,
        { expiresIn: "24d" } // Новый access токен
      )
      // Генерируем новый refresh токен для безопасности
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
    // ---------------------------------------------------------------- need changes
    logout: async (_, __, context) => {
      if (!context.user) throw new Error("Not authenticated")
      await prisma.user.update({
        where: { id: context.user.id },
        data: { refreshToken: null }
      })
      return { message: "Logged out successfully" }
    },
    deleteUser: async (_, { id }, context) => {
      if (context.user.role !== "SUPERADMIN" && context.user.id !== id) {
        throw new Error("Access forbidden: Admins only or self-delete allowed")
      }
      return await prisma.user.delete({
        where: { id }
      })
    }
  },
  Subscription: {
    userCreated: {
      subscribe: () => pubsub.asyncIterator([USER_CREATED])
    }
  }
}

export default userResolver
