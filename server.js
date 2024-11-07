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
const httpServer = http.createServer(app)
const schema = makeExecutableSchema({
  typeDefs: mergedTypeDefs,
  resolvers: mergedResolvers
})
const wsServer = new WebSocketServer({ server: httpServer, path: "/graphql" })
const serverCleanup = useServer({ schema }, wsServer)
const server = new ApolloServer({
  schema: schema,
  csrfPrevention: true,
  cache: "bounded",
  plugins: [
    ApolloServerPluginDrainHttpServer({ httpServer }),
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
          user = await prisma.user.findUnique({ where: { id: decoded.userId } })
        } catch (e) {
          console.error("Error verifying token:", e)
        }
      }
      return { user }
    }
  })
)

const PORT = 4000
const HOST = "0.0.0.0"
// Now that our HTTP server is fully set up, we can listen to it.
httpServer.listen({ port: PORT, host: HOST }, () => {
  console.log(`Server is now running on http://localhost:${PORT}/graphql`)
})
