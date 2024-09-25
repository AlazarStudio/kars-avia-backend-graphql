import { prisma } from "../../prisma.js"
import argon2 from "argon2"
import jwt from "jsonwebtoken"
import GraphQLUpload from "graphql-upload/GraphQLUpload.mjs"
import uploadImage from "../../exports/uploadImage.js"
import { logAction } from "../../exports/logaction.js"
import { adminHotelAirMiddleware } from "../../middlewares/authMiddleware.js"
import speakeasy from '@levminer/speakeasy';
import qrcode from 'qrcode';

const userResolver = {
  Upload: GraphQLUpload,

  Query: {
    users: async () => {
      return prisma.user.findMany()
    },
    airlineUsers: async (_, { airlineId }) => {
      return prisma.user.findMany({
        where: {
          airlineId: airlineId
        }
      })
    },
    hotelUsers: async (_, { hotelId }) => {
      return prisma.user.findMany({
        where: {
          hotelId: hotelId
        }
      })
    },
    dispatcherUsers: async () => {
      return prisma.user.findMany({
        where: {
          dispatcher: true
        }
      })
    },
    user: async (_, { userId }) => {
      return prisma.user.findUnique({
        where: { id: userId }
      })
    }
  },
  Mutation: {
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
        process.env.JWT_SECRET
      )

      return {
        ...newUser,
        token
      }
    },

    // -------------------------------- 2FA -------------------------------- ↓↓↓↓
    enable2FA: async (_, { input }, context) => {
      if (!context.user) throw new Error("Unauthorized")

      const twoFASecret = speakeasy.generateSecret().base32

      await prisma.user.update({
        where: { id: context.user.id },
        data: { twoFASecret, is2FAEnabled: true }
      })

      // const token2fa = speakeasy.totp({
      //   secret: twoFASecret,
      //   encoding: 'base32'
      // })

      const otpauthUrl = speakeasy.otpauthURL({
        secret: twoFASecret,
        label: `KarsAvia (${context.user.email})`,
        algorithm: "sha256",
      })

      console.log("otpauthUrl: ", otpauthUrl, "\n twoFASecret: ", twoFASecret)

      const qrCodeUrl = await qrcode.toDataURL(otpauthUrl)

      return { qrCodeUrl }
    },

    verify2FA: async (_, { token }, context ) => {
      if (!context.user) throw new Error("Unauthorized")

      const user = await prisma.user.findUnique({
        where: { id: context.user.id }
      })
      
      // const token2fa = speakeasy.totp({
      //   secret: user.twoFASecret,
      //   encoding: 'base32'
      // })

      const verified = speakeasy.totp.verify({
        secret: user.twoFASecret,
        encoding: "base32",
        token: token
      })

      if (!verified) throw new Error("Invalid 2FA token")

      return { success: true }
    },
    // -------------------------------- 2FA -------------------------------- ↑↑↑↑

    signIn: async (_, { input }) => {
      const { login, password, token2FA } = input
      const user = await prisma.user.findUnique({ where: { login } })

      if (!user || !(await argon2.verify(user.password, password))) {
        throw new Error("Invalid credentials")
      }

      // ---------------- 2FA ---------------- ↓↓↓↓
      if (user.is2FAEnabled) {
        const verified = speakeasy.totp.verify({
          secret: user.twoFASecret,
          encoding: "base32",
          token: token2FA
        })

        if (!verified) {
          throw new Error("Invalid 2FA token")
        }
      }
      // ---------------- 2FA ---------------- ↑↑↑↑

      const token = jwt.sign(
        {
          userId: user.id,
          role: user.role,
          hotelId: user.hotelId && user.hotelId,
          airlineId: user.airlineId && user.airlineId
        },
        process.env.JWT_SECRET
      )

      return {
        ...user,
        token
      }
    },
    registerUser: async (_, { input, images }, context) => {
      adminHotelAirMiddleware(context)

      let imagePaths = []
      if (images && images.length > 0 && images !== null) {
        console.log("Images", images)
        for (const image of images) {
          console.log("image", image)
          imagePaths.push(await uploadImage(image))
        }
      }

      const {
        name,
        email,
        login,
        password,
        role,
        hotelId,
        airlineId,
        dispatcher
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
        dispatcher: dispatcher || false
      }

      if (images != null) {
        createdData.images = imagePaths
      }

      const newUser = await prisma.user.create({
        data: createdData
      })

      return newUser
    },
    updateUser: async (_, { input, images }, context) => {
      if (context.user.role !== "SUPERADMIN" && context.user.id !== id) {
        throw new Error("Access forbidden: Admins only or self-update allowed")
      }

      let imagePaths = []
      if (images && images.length > 0 && images !== null) {
        console.log("Images", images)
        for (const image of images) {
          console.log("image", image)
          imagePaths.push(await uploadImage(image))
        }
      }

      const { id, name, email, login, password } = input

      let hashedPassword
      if (password) {
        hashedPassword = await argon2.hash(password)
      }

      const updatedData = {
        name,
        email,
        login
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

      logAction(id, "update", user)

      return user
    },
    logout: async (_, __, context) => {
      //
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
  }
}

export default userResolver
