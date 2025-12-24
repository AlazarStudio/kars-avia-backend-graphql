// import { PrismaClient } from "@prisma/client"
// import { PrismaClient } from "./generated/client"
import { PrismaClient } from "./generated/client/index.js"
import dotenv from "dotenv"

// Загружаем переменные окружения, если они еще не загружены
dotenv.config()

// Для Prisma 7+: передаем datasourceUrl через конструктор
// Для Prisma 6: этот параметр игнорируется, используется url из schema.prisma
export const prisma = new PrismaClient(
  process.env.DATABASE_URL
    ? {
        datasourceUrl: process.env.DATABASE_URL
      }
    : {}
)