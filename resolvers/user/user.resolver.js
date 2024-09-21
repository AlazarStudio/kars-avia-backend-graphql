import { prisma } from "../../prisma.js"
import argon2 from "argon2"
import jwt from "jsonwebtoken"

const userResolver = {
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
    signUp: async (_, { input }) => {
      const { name, email, login, password } = input
      const hashedPassword = await argon2.hash(password)

      const newUser = await prisma.user.create({
        data: {
          name,
          email,
          login,
          password: hashedPassword,
          role: "USER" // Дефолтная роль для новых пользователей
        }
      })

      const token = jwt.sign(
        { userId: newUser.id, role: newUser.role },
        process.env.JWT_SECRET
      )

      return {
        ...newUser,
        token
      }
    },
    signIn: async (_, { input }) => {
      const { login, password } = input
      const user = await prisma.user.findUnique({ where: { login } })

      if (!user || !(await argon2.verify(user.password, password))) {
        throw new Error("Invalid credentials")
      }

      const token = jwt.sign(
        { userId: user.id, role: user.role },
        process.env.JWT_SECRET
      )

      return {
        ...user,
        token
      }
    },
    registerUser: async (_, { input }, context) => {
      // if (
      //   context.user.role !== "SUPERADMIN" &&
      //   context.user.role !== "ADMIN" &&
      //   context.user.role !== "HOTELADMIN" &&
      //   context.user.role !== "AIRLINEADMIN"
      // ) {
      //   throw new Error("Access forbidden: Admins only")
      // }

      const { name, email, login, password, role, hotelId, airlineId } = input
      const hashedPassword = await argon2.hash(password)

      const newUser = await prisma.user.create({
        data: {
          name,
          email,
          login,
          password: hashedPassword,
          hotelId: hotelId ? hotelId : undefined,
          airlineId: airlineId ? airlineId : undefined,
          role: role || "USER"
        }
      })

      return newUser
    },

    updateUser: async (_, { input }, context) => {
      // if (
      //   context.user.role !== "SUPERADMIN" &&
      //   context.user.role !== "ADMIN" &&
      //   context.user.role !== "HOTELADMIN" &&
      //   context.user.role !== "AIRLINEADMIN"
      // ) {
      //   throw new Error("Access forbidden: Admins only")
      // }

      const { id, name, email, login, password, role } = input
      const hashedPassword = await argon2.hash(password)

      const user = await prisma.user.update({
        where: { id: id },
        data: {
          name,
          email,
          login,
          password: hashedPassword,
          role: role
        }
      })

      return user
    },

    logout: async (_, __, context) => {
      //
      return { message: "Logged out successfully" }
    }
  }
}

export default userResolver
