import fs from "fs"
import jwt from "jsonwebtoken"
import cors from "cors"
import http from "http"
import https from "https"
import dotenv from "dotenv"
import express from "express"
import cookieParser from "cookie-parser" 

import { ApolloServer } from "@apollo/server"
import { expressMiddleware } from "@apollo/server/express4"
import { ApolloServerPluginDrainHttpServer } from "@apollo/server/plugin/drainHttpServer"

import { WebSocketServer } from "ws"
import { useServer } from "graphql-ws/lib/use/ws"
import { makeExecutableSchema } from "@graphql-tools/schema"

import { prisma } from "./prisma.js"
import mergedTypeDefs from "./typeDefs/typedefs.js"
import mergedResolvers from "./resolvers/resolvers.js"
import GraphQLUpload from "graphql-upload/GraphQLUpload.mjs"
import graphqlUploadExpress from "graphql-upload/graphqlUploadExpress.mjs"
import { ApolloServerPluginLandingPageLocalDefault } from "apollo-server-core"

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

await server.start()
app.use(cookieParser())
app.use(graphqlUploadExpress())
app.use("/uploads", express.static("uploads"))
app.use(
  "/",
  cors({
    // origin: "http://localhost:3000",
    credentials: true
  }),
  express.json(),
  expressMiddleware(server, {
    context: async ({ req, res }) => {
      const token = req.cookies.token
      let user = null

      if (token) {
        try {
          const decoded = jwt.verify(token, process.env.JWT_SECRET)
          user = await prisma.user.findUnique({ where: { id: decoded.userId } })
        } catch (e) {
          console.error("Error verifying token:", e)
        }
      }

      return { user, res }
    }
  })
)

// Listen on PORT
const PORT = 4000
httpServer.listen({ port: PORT }, () => {
  console.log(`Server is now running on http://localhost:${PORT}/graphql`)
})
