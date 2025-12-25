import dotenv from "dotenv"
import { defineConfig } from "prisma/config"

// Загружаем переменные окружения
dotenv.config()

export default defineConfig({
  schema: "prisma/schema.prisma",
  migrations: {
    path: "prisma/migrations"
  },
  datasource: {
    url: process.env.DATABASE_URL
  }
})

