import "./load-env.js"
import { createRequire } from "module"
import fs from "fs"
import cors from "cors"
import http from "http"
import https from "https"
import express from "express"
import { prisma } from "./prisma.js"
import { ApolloServer } from "@apollo/server"
import { GraphQLError, getOperationAST } from "graphql"
import { randomUUID } from "crypto"
import { expressMiddleware } from "@apollo/server/express4"
import { ApolloServerPluginLandingPageDisabled } from "@apollo/server/plugin/disabled"
import { ApolloServerPluginDrainHttpServer } from "@apollo/server/plugin/drainHttpServer"
import { WebSocketServer } from "ws"
import { useServer } from "graphql-ws/lib/use/ws"
import { makeExecutableSchema } from "@graphql-tools/schema"
import mergedTypeDefs from "./typeDefs/typedefs.js"
import mergedResolvers from "./resolvers/resolvers.js"
import graphqlUploadExpress from "graphql-upload/graphqlUploadExpress.mjs"
import {
  startArchivingJob,
  startPresenceCleanupJob,
  stopArchivingJob,
  stopPresenceCleanupJob
} from "./services/cron/cronTasks.js"
import {
  startContractArchivingJob,
  stopContractArchivingJob
} from "./services/cron/contractArchiving.js"
import { touchLastSeenForContext } from "./services/user/userPresence.js"
import { buildAuthContext, isAuthError } from "./middlewares/authContext.js"
import { logger } from "./services/infra/logger.js"
import { getCorsOptions } from "./services/infra/corsOptions.js"
import { ApolloServerPluginLandingPageLocalDefault } from "@apollo/server/plugin/landingPage/default"
import filesRouter from "./services/routes/files.js"
import authRouter from "./services/routes/auth.js"
import {
  assertSubscriptionPubSubConfig,
  disconnectPubSubRedis
} from "./services/infra/pubsub.js"

import { botService } from "./services/bot/botService.js"

assertSubscriptionPubSubConfig()
const require = createRequire(import.meta.url)
const { version: appVersion } = require("./package.json")
const app = express()

/* =========================
   🩺 HEALTH CHECK
========================= */
app.get("/health", async (req, res) => {
  try {
    // минимальная проверка БД
    await prisma.$runCommandRaw({ ping: 1 })

    res.status(200).json({
      status: "ok",
      version: appVersion,
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

app.post("/MAX", async (req, res) => {
  try {
    const update = req.body

    if (update.message) {
      await botService.handleIncomingMessage("MAX", {
        chatId: update.message.chat.id.toString(),
        userId: update.message.from.id.toString(),
        messageId: update.message.message_id.toString(),
        text: update.message.text || "",
        userData: {
          firstName: update.message.from.first_name,
          lastName: update.message.from.last_name
        }
      })
    }

    res.sendStatus(200)
  } catch (error) {
    console.error("Ошибка webhook:", error)
    res.sendStatus(500)
  }
})

// SSL
const sslOptions = {
  key: fs.readFileSync(process.env.SERVER_KEY),
  cert: fs.readFileSync(process.env.SERVER_CERT),
  ca: fs.readFileSync(process.env.SERVER_CA)
}

const httpServer = http.createServer((req, res) => {
  res.writeHead(301, { Location: `https://${req.headers.host}${req.url}` })
  res.end()
})

const httpsServer = https.createServer(sslOptions, app)

const schema = makeExecutableSchema({
  typeDefs: mergedTypeDefs,
  resolvers: mergedResolvers
})

async function buildGraphqlContext(req) {
  try {
    const context = await buildAuthContext(req.headers.authorization || null)
    touchLastSeenForContext(context)
    return context
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
   🔌 WS (graphql-ws)
========================= */
// Ping/pong через ws; без ответа в срок — terminate (часто видно как 1006). Редкий ping — риск idle на LB.
const WS_KEEPALIVE_DEFAULT_MS = 12_000
const wsKeepAliveParsed = parseInt(process.env.WS_KEEPALIVE_MS ?? "", 10)
const wsKeepAlive =
  Number.isFinite(wsKeepAliveParsed) && wsKeepAliveParsed > 0
    ? wsKeepAliveParsed
    : WS_KEEPALIVE_DEFAULT_MS

function wsShortUserAgent(ua) {
  if (!ua || typeof ua !== "string") return "-"
  return ua.length > 120 ? `${ua.slice(0, 120)}…` : ua
}

const wsServer = new WebSocketServer({
  server: httpsServer,
  path: "/graphql"
})

const serverCleanup = useServer(
  {
    schema,
    // JWT и контекст пересобираются на каждую операцию по WS; новый токен — новый ConnectionInit.
    onConnect(ctx) {
      ctx.wsSessionId = randomUUID()
      ctx.wsConnectedAt = Date.now()
      const req = ctx.extra?.request
      const xff = req?.headers?.["x-forwarded-for"] || "-"
      const xri = req?.headers?.["x-real-ip"] || "-"
      const remote = req?.socket?.remoteAddress || "-"
      const ua = wsShortUserAgent(req?.headers?.["user-agent"])
      logger.info(
        `[WS SESSION] id=${ctx.wsSessionId} xff=${xff} xri=${xri} remote=${remote} ua=${ua}`
      )
    },

    context: async (ctx, message, execArgs) => {
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

      const sid = ctx.wsSessionId || "-"
      const opName = message?.payload?.operationName || "-"
      let opKind = "-"
      try {
        const opAst = getOperationAST(
          execArgs.document,
          execArgs.operationName ?? undefined
        )
        if (opAst) opKind = opAst.operation
      } catch {
        /* ignore */
      }

      logger.info(
        `[WS OPERATION] id=${sid} op=${opName} kind=${opKind} subjectType=${
          context.subjectType || "ANON"
        } subjectId=${context.subject?.id || "-"}`
      )

      touchLastSeenForContext(context)
      return context
    },

    onDisconnect(ctx, code, reason) {
      const sid = ctx.wsSessionId || "-"
      const durationMs =
        typeof ctx.wsConnectedAt === "number"
          ? Date.now() - ctx.wsConnectedAt
          : "-"
      logger.info(
        `[WS DISCONNECT] id=${sid} durationMs=${durationMs} code=${code} reason=${reason?.toString() || ""}`
      )
    },

    onClose(ctx, code, reason) {
      if (!ctx.acknowledged) {
        logger.info(
          `[WS CLOSE] handshake_incomplete code=${code} reason=${reason?.toString() || ""}`
        )
      }
    },

    onError(ctx, msg, errors) {
      logger.error("[WS ERROR]", errors)
    }
  },
  wsServer,
  wsKeepAlive
)

/* =========================
   🚀 APOLLO SERVER
========================= */
const server = new ApolloServer({
  schema,
  csrfPrevention: {
    // Разрешаем multipart upload-клиентам с JWT в Authorization работать
    // при включенной CSRF-защите Apollo.
    requestHeaders: [
      "authorization",
      "x-apollo-operation-name",
      "apollo-require-preflight"
    ]
  },
  cache: "bounded",
  plugins: [
    ApolloServerPluginDrainHttpServer({ httpServer: httpsServer }),
    ApolloServerPluginLandingPageDisabled(),
    // ApolloServerPluginLandingPageLocalDefault(),
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

startArchivingJob()
startContractArchivingJob()
startPresenceCleanupJob()
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
      req.headers["x-apollo-operation-name"] ||
      req.headers["apollo-operation-name"] ||
      "unknown"
    const hasCsrfHeaders =
      Boolean(req.headers.authorization) ||
      Boolean(req.headers["apollo-require-preflight"]) ||
      Boolean(req.headers["x-apollo-operation-name"])

    if (isMultipart) {
      logger.info(
        `[GRAPHQL UPLOAD] multipart request operation=${operationName}`
      )
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

app.use(
  "/api/auth",
  cors(getCorsOptions()),
  express.json({ limit: "64kb" }),
  authRouter
)

// Убрана статическая раздача файлов для безопасности
// Все файлы теперь доступны только через /files/* с авторизацией
// app.use("/uploads", express.static("uploads"))
// app.use("/reports", express.static("reports"))
// app.use("/reserve_files", express.static("reserve_files"))

app.use(
  "/",
  cors(getCorsOptions()),
  express.json(),
  expressMiddleware(server, {
    context: async ({ req }) => buildGraphqlContext(req)
  })
)

/* =========================
   ▶️ START
========================= */
httpsServer.listen(443, () =>
  console.log("Server running on https://localhost:443/graphql")
)

httpServer.listen(80, () => console.log("Redirecting HTTP → HTTPS"))

/* =========================
   🛑 GRACEFUL SHUTDOWN
========================= */

const shutdown = async (signal) => {
  logger.warn(`[SHUTDOWN] Signal received: ${signal}`)

  try {
    // 1. Останавливаем cron
    stopArchivingJob()
    stopContractArchivingJob()
    stopPresenceCleanupJob()
    logger.info("[SHUTDOWN] Cron stopped")

    // 2. Закрываем WebSocket-сервер
    await serverCleanup.dispose()
    logger.info("[SHUTDOWN] WS server closed")

    await disconnectPubSubRedis()

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
