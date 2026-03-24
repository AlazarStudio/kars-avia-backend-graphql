import cors from "cors"
import http from "http"
import dotenv from "dotenv"
import express from "express"
import { prisma } from "./prisma.js"
import { ApolloServer } from "@apollo/server"
import { GraphQLError } from "graphql"
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
import { buildAuthContext, isAuthError } from "./middlewares/authContext.js"
import { logger } from "./services/infra/logger.js"
import { PUBSUB_BACKEND } from "./services/infra/pubsub.js"
import filesRouter from "./services/routes/files.js"

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
      env: process.env.NODE_ENV || "development",
      pubsub: PUBSUB_BACKEND
    })
  } catch (e) {
    logger.error("[HEALTH] DB unavailable", e)

    res.status(500).json({
      status: "error",
      reason: "DB_UNAVAILABLE"
    })
  }
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

async function buildGraphqlContext(req) {
  try {
    return await buildAuthContext(req.headers.authorization || null)
  } catch (e) {
    if (isAuthError(e)) {
      throw new GraphQLError("Unauthorized", {
        extensions: {
          code: "UNAUTHENTICATED",
          authCode: e.code,
          http: { status: e.status || 401 }
        }
      })
    }
    throw e
  }
}

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
    // Контекст подписок фиксируется при connect; при истечении JWT клиенту нужно переподключить WS с новым токеном.
    context: async (ctx) => {
      const authHeader =
        ctx.connectionParams?.Authorization ||
        ctx.connectionParams?.authorization ||
        null

      let context
      try {
        context = await buildAuthContext(authHeader)
      } catch (e) {
        if (isAuthError(e)) {
          logger.warn(`[WS AUTH] Unauthorized connection: ${e.code}`)
          throw new Error("Unauthorized")
        }
        throw e
      }

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
  csrfPrevention: {
    // Разрешаем multipart upload-клиентам с JWT в Authorization работать
    // при включенной CSRF-защите Apollo.
    requestHeaders: ["authorization", "x-apollo-operation-name", "apollo-require-preflight"]
  },
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
app.use(graphqlUploadExpress())

// Диагностика upload-запросов: помогает быстро понять причину HTTP 400.
app.use("/graphql", (req, res, next) => {
  if (req.method === "POST") {
    const contentType = req.headers["content-type"] || ""
    const isMultipart = String(contentType).includes("multipart/form-data")
    const operationName =
      req.headers["x-apollo-operation-name"] || req.headers["apollo-operation-name"] || "unknown"
    const hasCsrfHeaders =
      Boolean(req.headers.authorization) ||
      Boolean(req.headers["apollo-require-preflight"]) ||
      Boolean(req.headers["x-apollo-operation-name"])

    if (isMultipart) {
      logger.info(`[GRAPHQL UPLOAD] multipart request operation=${operationName}`)
    }

    if (isMultipart && !hasCsrfHeaders) {
      logger.warn(
        "[GRAPHQL UPLOAD] multipart request without csrf-allow headers (authorization/apollo-require-preflight/x-apollo-operation-name)"
      )
    }
  }
  next()
})

// Backward compatibility for legacy file URLs stored as /uploads/*.
// Redirect them to the protected files route to avoid GraphQL/CSRF responses.
app.use("/uploads", (req, res) => {
  const suffix = req.originalUrl.slice("/uploads".length)
  const target = `/files/uploads${suffix}`
  return res.redirect(307, target)
})

// Защищенный роут для файлов (требует JWT токен и проверяет права доступа)
app.use("/files", filesRouter)

// Убрана статическая раздача файлов для безопасности
// Все файлы теперь доступны только через /files/* с авторизацией
// app.use("/uploads", express.static("uploads"))
// app.use("/reports", express.static("reports"))
// app.use("/reserve_files", express.static("reserve_files"))

app.use(
  "/",
  cors(),
  express.json(),
  expressMiddleware(server, {
    context: async ({ req }) => buildGraphqlContext(req)
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
