import fs from "fs"
import jwt from "jsonwebtoken"
import cors from "cors"
import http from "http"
import https from "https"
import dotenv from "dotenv"
import express from "express"
import { prisma } from "./prisma.js"
import { ApolloServer } from "@apollo/server"
import { expressMiddleware } from "@apollo/server/express4"
import { ApolloServerPluginDrainHttpServer } from "@apollo/server/plugin/drainHttpServer"
import { WebSocketServer } from "ws"
import { useServer } from "graphql-ws/lib/use/ws"
import { makeExecutableSchema } from "@graphql-tools/schema"
import mergedTypeDefs from "./typeDefs/typedefs.js"
import mergedResolvers from "./resolvers/resolvers.js"
import authMiddleware, {
  adminMiddleware
} from "./middlewares/authMiddleware.js"
import GraphQLUpload from "graphql-upload/GraphQLUpload.mjs"
import graphqlUploadExpress from "graphql-upload/graphqlUploadExpress.mjs"
import { ApolloServerPluginLandingPageLocalDefault } from "apollo-server-core"
import { startArchivingJob } from "./utils/request/cronTasks.js"

dotenv.config()
const app = express()

// Загрузка SSL сертификатов
const sslOptions = {
  key: fs.readFileSync("/etc/ssl/private/privkey.pem"), // Укажите правильный путь
  cert: fs.readFileSync("/etc/ssl/certs/cert.pem"),
  passphrase: process.env.SSL_PASSWORD, // Используйте переменную окружения для хранения пароля
  // Уберите строку ca, если у вас нет цепочки сертификатов
}

// HTTP сервер для перенаправления на HTTPS
const httpServer = http.createServer((req, res) => {
  res.writeHead(301, { Location: `https://${req.headers.host}${req.url}` })
  res.end()
})

const httpsServer = https.createServer(sslOptions, app)
const schema = makeExecutableSchema({
  typeDefs: mergedTypeDefs,
  resolvers: mergedResolvers
})
const wsServer = new WebSocketServer({ server: httpsServer, path: "/graphql" })
const serverCleanup = useServer({ schema }, wsServer)
const server = new ApolloServer({
  schema: schema,
  csrfPrevention: true,
  cache: "bounded",
  plugins: [
    ApolloServerPluginDrainHttpServer({ httpServer: httpsServer }),
    {
      async serverWillStart() {
        return {
          async drainServer() {
            await serverCleanup.dispose()
          }
        }
      }
    },
    ApolloServerPluginLandingPageLocalDefault({ embed: true })
  ]
})

// --------------------------------
startArchivingJob()

// --------------------------------
await server.start()
app.use(graphqlUploadExpress())
app.use("/uploads", express.static("uploads"))
app.use(
  "/",
  cors(),
  express.json(),
  expressMiddleware(server, {
    context: async ({ req, res }) => {
      const authHeader = req.headers.authorization
      if (!authHeader) {
        return { user: null }
      }
      const token = authHeader.startsWith("Bearer ")
        ? authHeader.slice(7, authHeader.length)
        : authHeader
      let user = null
      if (token) {
        try {
          const decoded = jwt.verify(token, process.env.JWT_SECRET)
          user = await prisma.user.findUnique({
            where: { id: decoded.userId },
            select: {
              id: true,
              name: true,
              email: true,
              number: true,
              role: true,
              position: true,
              airlineId: true,
              airlineDepartmentId: true,
              hotelId: true,
              dispatcher: true
            }
          })
        } catch (e) {
          console.error("Error verifying token:", e)
        }
      }
      return { user }
    }
  })
)

const PORT = 443 // HTTPS порт
const HTTP_PORT = 80 // HTTP порт

// Запуск HTTPS сервера
httpsServer.listen(PORT, () => {
  console.log(`Server is now running on https://localhost:${PORT}/graphql`)
})

// Запуск HTTP сервера для редиректа
httpServer.listen(HTTP_PORT, () => {
  console.log(`Redirecting HTTP to HTTPS on port ${HTTP_PORT}`)
})
