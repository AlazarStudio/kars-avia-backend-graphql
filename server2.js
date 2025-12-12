import jwt from "jsonwebtoken"
import cors from "cors"
import http from "http"
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
import graphqlUploadExpress from "graphql-upload/graphqlUploadExpress.mjs"
import {
  startArchivingJob,
  stopArchivingJob
} from "./services/cron/cronTasks.js"
import { ApolloServerPluginLandingPageLocalDefault } from "@apollo/server/plugin/landingPage/default"
import { buildAuthContext } from "./middlewares/authContext.js"
import rateLimit from "express-rate-limit"
import { logger } from "./services/infra/logger.js"

dotenv.config()
const app = express()

/* =========================
   🩺 HEALTH CHECK
========================= */
app.get("/health", async (req, res) => {
  try {
    // минимальная проверка БД
    await prisma.$queryRaw`SELECT 1`

    res.status(200).json({
      status: "ok",
      uptime: process.uptime(),
      timestamp: Date.now(),
      env: process.env.NODE_ENV || "development"
    })
  } catch (e) {
    logger.error("[HEALTH] DB unavailable", e)

    res.status(500).json({
      status: "error",
      reason: "DB_UNAVAILABLE"
    })
  }
})

const limiter = rateLimit({
  windowMs: 1 * 60 * 1000, // 1 минута
  max: 100, // 100 запросов
  standardHeaders: true,
  legacyHeaders: false
})

/* =========================
   🌐 HTTP SERVER (без SSL)
========================= */
const httpServer = http.createServer(app)

/* =========================
   🧠 SCHEMA
========================= */
const schema = makeExecutableSchema({
  typeDefs: mergedTypeDefs,
  resolvers: mergedResolvers
})

/* =========================
   🔌 WEBSOCKET (graphql-ws)
========================= */

const wsServer = new WebSocketServer({
  server: httpServer,
  path: "/graphql"
})

const serverCleanup = useServer(
  {
    schema,
    context: async (ctx) => {
      const authHeader = ctx.connectionParams?.Authorization || null
      const context = await buildAuthContext(authHeader)

      logger.info(
        `[WS CONNECT] type=${context.subjectType || "ANON"} id=${
          context.subject?.id || "-"
        }`
      )

      return context
    },

    onDisconnect(ctx, code, reason) {
      logger.info(
        `[WS DISCONNECT] code=${code} reason=${reason?.toString() || ""}`
      )
    },

    onError(ctx, msg, errors) {
      logger.error("[WS ERROR]", errors)
    }
  },
  wsServer
)

/* =========================
   🚀 APOLLO SERVER
========================= */
const server = new ApolloServer({
  schema,
  csrfPrevention: true,
  cache: "bounded",
  introspection: process.env.NODE_ENV !== "production",
  plugins: [
    ApolloServerPluginDrainHttpServer({ httpServer }),
    ApolloServerPluginLandingPageLocalDefault(),
    {
      async serverWillStart() {
        return {
          async drainServer() {
            await serverCleanup.dispose()
          }
        }
      }
    }
  ]
})

/* =========================
   ⏱ CRON
========================= */
startArchivingJob()

await server.start()

/* =========================
   🌍 EXPRESS
========================= */
app.use(limiter)

app.use(graphqlUploadExpress())
app.use("/uploads", express.static("uploads"))
app.use("/reports", express.static("reports"))
app.use("/reserve_files", express.static("reserve_files"))

app.use(
  "/",
  cors(),
  express.json(),
  expressMiddleware(server, {
    context: async ({ req }) =>
      buildAuthContext(req.headers.authorization || null)
  })
)

/* =========================
   ▶️ START
========================= */
const PORT = 4000
const HOST = "0.0.0.0"

httpServer.listen({ port: PORT, host: HOST }, () => {
  console.log(`Server running on http://localhost:${PORT}/graphql`)
})

/* =========================
   🛑 GRACEFUL SHUTDOWN
========================= */

const shutdown = async (signal) => {
  logger.warn(`[SHUTDOWN] Signal received: ${signal}`)

  try {
    // 1. Останавливаем cron
    stopArchivingJob()
    logger.info("[SHUTDOWN] Cron stopped")

    // 2. Закрываем WebSocket-сервер
    await serverCleanup.dispose()
    logger.info("[SHUTDOWN] WS server closed")

    // 3. Останавливаем HTTP/HTTPS сервер
    const closeServer = (srv, name) =>
      new Promise((resolve) => {
        srv.close(() => {
          logger.info(`[SHUTDOWN] ${name} closed`)
          resolve()
        })
      })

    if (typeof httpsServer !== "undefined") {
      await closeServer(httpsServer, "HTTPS")
    }

    if (typeof httpServer !== "undefined") {
      await closeServer(httpServer, "HTTP")
    }

    // 4. Закрываем Prisma
    await prisma.$disconnect()
    logger.info("[SHUTDOWN] Prisma disconnected")

    logger.warn("[SHUTDOWN] Completed. Exiting process.")
    process.exit(0)
  } catch (e) {
    logger.error("[SHUTDOWN] Error during shutdown", e)
    process.exit(1)
  }
}

// PM2 / Docker / Linux
process.on("SIGTERM", shutdown)
process.on("SIGINT", shutdown)

// страховка
process.on("uncaughtException", async (err) => {
  logger.error("[FATAL] Uncaught exception", err)
  await shutdown("uncaughtException")
  process.exit(1)
})
