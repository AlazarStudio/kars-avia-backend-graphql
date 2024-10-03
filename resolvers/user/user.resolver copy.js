import { prisma } from "../../prisma.js"
import argon2 from "argon2"
import jwt from "jsonwebtoken"
import GraphQLUpload from "graphql-upload/GraphQLUpload.mjs"
import uploadImage from "../../exports/uploadImage.js"
import { logAction } from "../../exports/logaction.js"
import { adminHotelAirMiddleware } from "../../middlewares/authMiddleware.js"

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
    user: async (_, { userId }) => {
      return prisma.user.findUnique({
        where: { id: userId }
      })
    }
  },

  Mutation: {
    signUp: async (_, { input, images }, { res }) => {
      let imagePaths = []
      if (images && images.length > 0) {
        for (const image of images) {
          imagePaths.push(await uploadImage(image))
        }
      }

      const { name, email, login, password, role } = input
      const hashedPassword = await argon2.hash(password)

      const newUser = await prisma.user.create({
        data: {
          name,
          email,
          login,
          password: hashedPassword,
          role: role ? role : "USER",
          images: imagePaths
        }
      })

      const token = jwt.sign(
        { userId: newUser.id, role: newUser.role, hotelId: newUser.hotelId, airlineId: newUser.airlineId },
        process.env.JWT_SECRET,
        { expiresIn: "1h" }
      )

      res.cookie('token', token, {
        httpOnly: true,
        // secure: process.env.NODE_ENV === 'production', 
        sameSite: 'Strict',
        maxAge: 1000 * 60 * 60 // 1 час
      })

      return {
        ...newUser,
        token
      }
    },

    signIn: async (_, { input }, { res }) => {
      const { login, password } = input
      const user = await prisma.user.findUnique({ where: { login } })

      if (!user || !(await argon2.verify(user.password, password))) {
        throw new Error("Invalid credentials")
      }

      const token = jwt.sign(
        { userId: user.id, role: user.role, hotelId: user.hotelId, airlineId: user.airlineId },
        process.env.JWT_SECRET,
        { expiresIn: "1h" }
      )

      res.cookie('token', token, {
        httpOnly: true,
        // secure: process.env.NODE_ENV === 'production',
        sameSite: 'Strict',
        maxAge: 1000 * 60 * 60 // 1 час
      })

      return {
        ...user,
        token
      }
    },

    registerUser: async (_, { input, images }, context) => {
      adminHotelAirMiddleware(context)

      let imagePaths = []
      if (images && images.length > 0) {
        for (const image of images) {
          imagePaths.push(await uploadImage(image))
        }
      }

      const { name, email, login, password, role, hotelId, airlineId } = input
      const hashedPassword = await argon2.hash(password)

      const createdData = {
        name,
        email,
        login,
        password: hashedPassword,
        hotelId: hotelId || undefined,
        airlineId: airlineId || undefined,
        role: role || "USER",
        images: imagePaths
      }

      const newUser = await prisma.user.create({
        data: createdData
      })

      logAction(context.user.id, "registerUser", newUser)

      return newUser
    },

    updateUser: async (_, { input, images }, context) => {
      const { id, name, email, login, password } = input

      if (context.user.role !== "SUPERADMIN" && context.user.id !== id) {
        throw new Error("Access forbidden: Admins only or self-update allowed")
      }

      let imagePaths = []
      if (images && images.length > 0) {
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
        ...(hashedPassword && { password: hashedPassword }),
        ...(images && { images: imagePaths })
      }

      const user = await prisma.user.update({
        where: { id },
        data: updatedData
      })

      await logAction({
        userId: context.user.id,
        action: 'update_user',
        description: {
          
        },
      });

      return user
    },

    logout: async (_, __, { res }) => {
      res.clearCookie("token")
      return { message: "Logged out successfully" }
    },

    deleteUser: async (_, { id }, context) => {
      if (context.user.role !== "SUPERADMIN" && context.user.id !== id) {
        throw new Error("Access forbidden: Admins only or self-delete allowed")
      }

      const deletedUser = await prisma.user.delete({
        where: { id }
      })

      logAction(context.user.id, "deleteUser", deletedUser)

      return deletedUser
    }
  }
}

export default userResolver
