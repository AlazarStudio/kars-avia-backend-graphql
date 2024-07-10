import { prisma } from '../../prisma.js';
import argon2 from 'argon2';
import jwt from 'jsonwebtoken';

const userResolver = {
  Query: {
    users: async () => {
      return prisma.user.findMany();
    },
    user: async (_, { userId }) => {
      return prisma.user.findUnique({
        where: { id: userId }
      });
    }
  },
  Mutation: {
    signUp: async (_, { input }) => {
      const { name, email, login, password } = input;
      const hashedPassword = await argon2.hash(password);

      const newUser = await prisma.user.create({
        data: {
          name,
          email,
          login,
          password: hashedPassword,
          role: 'user' // Дефолтная роль для новых пользователей
        }
      });

      const token = jwt.sign({ userId: newUser.id }, process.env.JWT_SECRET);

      return {
        ...newUser,
        token
      };
    },
    signIn: async (_, { input }) => {
      const { login, password } = input;
      const user = await prisma.user.findUnique({ where: { login } });

      if (!user || !(await argon2.verify(user.password, password))) {
        throw new Error('Invalid credentials');
      }

      const token = jwt.sign({ userId: user.id }, process.env.JWT_SECRET);

      return {
        ...user,
        token
      };
    },
    registerUser: async (_, { input }, context) => {
      if (context.user.role !== 'admin') {
        throw new Error('Access forbidden: Admins only');
      }

      const { name, email, login, password, role } = input;
      const hashedPassword = await argon2.hash(password);

      const newUser = await prisma.user.create({
        data: {
          name,
          email,
          login,
          password: hashedPassword,
          role: role || 'user' // Дефолтная роль для новых пользователей
        }
      });

      return newUser;
    },
    logout: async (_, __, context) => {
      // Реализуйте логику выхода
      return { message: 'Logged out successfully' };
    }
  }
};

export default userResolver;
