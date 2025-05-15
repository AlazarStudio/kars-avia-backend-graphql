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
import { startArchivingJob } from "./utils/request/cronTasks.js"
import { ApolloServerPluginLandingPageDisabled } from "@apollo/server/plugin/disabled"
import { ApolloServerPluginLandingPageLocalDefault, ApolloServerPluginLandingPageProductionDefault } from '@apollo/server/plugin/landingPage/default';
import { logger } from "./utils/logger.js"


dotenv.config()
const app = express()

const httpServer = http.createServer(app)
const schema = makeExecutableSchema({
  typeDefs: mergedTypeDefs,
  resolvers: mergedResolvers
})
const wsServer = new WebSocketServer({ server: httpServer, path: "/graphql" })

const getDynamicContext = async (ctx, msg, args) => {
  // ctx is the graphql-ws Context where connectionParams live
  // console.log("\n ctx" + ctx, "\n ctx" + JSON.stringify(ctx))
  if (ctx.connectionParams.Authorization) {
    const authHeader = ctx.connectionParams.Authorization
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
            dispatcher: true,
            support: true
          }
        })
      } catch (e) {
        logger.error('Ошибка токена', e)
        console.error("Error verifying token:", e)
      }
    }
    return { user }
  }
  // Otherwise let our resolvers know we don't have a current user
  // return { user: null }
}

const serverCleanup = useServer(
  {
    schema,
    context: async (ctx, msg, args) => {
      return getDynamicContext(ctx, msg, args)
    }
  },
  wsServer
)
const server = new ApolloServer({
  schema: schema,
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
// --------------------------------
startArchivingJob()

// --------------------------------
await server.start()
app.use(graphqlUploadExpress())
app.use("/uploads", express.static("uploads"))
app.use("/reports", express.static("reports"))
app.use("/reserve_files", express.static("reserve_files"))

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
              dispatcher: true,
              support: true
            }
          })
        } catch (e) {
          logger.error('Ошибка токена', e)
          console.error("Error verifying token:", e + "\n user ")
        }
      }
      return { user }
    }
  })
)

// const PORT = 4444
const PORT = 4000
const HOST = "0.0.0.0"
// Now that our HTTP server is fully set up, we can listen to it.
httpServer.listen({ port: PORT, host: HOST }, () => {
  console.log(`Server is now running on http://localhost:${PORT}/graphql`)
})
