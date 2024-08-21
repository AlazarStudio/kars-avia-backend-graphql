import fs from "fs"
import cors from "cors"
import http from "http"
import https from "https"
import dotenv from "dotenv"
import express from "express"

import { ApolloServer } from "@apollo/server"
// import { split, HttpLink } from "@apollo/client"
import { expressMiddleware } from "@apollo/server/express4"
import { ApolloServerPluginDrainHttpServer } from "@apollo/server/plugin/drainHttpServer"

import { WebSocketServer } from "ws"
// import { createClient } from "graphql-ws"
import { useServer } from "graphql-ws/lib/use/ws"
import { makeExecutableSchema } from "@graphql-tools/schema"
// import { getMainDefinition } from "@apollo/client/utilities"
// import { GraphQLWsLink } from "@apollo/client/link/subscriptions"

import { prisma } from "./prisma.js"
import mergedTypeDefs from "./typeDefs/index.js"
import mergedResolvers from "./resolvers/index.js"
import authMiddleware, {
  adminMiddleware
} from "./middlewares/authMiddleware.js"

// ------------------------------------------------------------------------------------------------

dotenv.config()
const app = express()
const httpServer = http.createServer(app)

// const ca = fs.readFileSync('path/to/ca_bundle.crt', 'utf8');
// const privateKey = fs.readFileSync('path/to/private.key', 'utf8');
// const certificate = fs.readFileSync('path/to/certificate.crt', 'utf8');
// const credentials = { key: privateKey, cert: certificate, ca: ca };
// const httpsServer = https.createServer(credentials, app);

// ----------------------------------------------------------------

// const httpLink = new HttpLink({
//   uri: "http://localhost:4000/graphql"
// })

// const wsLink = new GraphQLWsLink(
//   createClient({
//     url: "ws://localhost:4000/subscriptions"
//   })
// )

// const splitLink = split(
//   ({ query }) => {
//     const definition = getMainDefinition(query)
//     return (
//       definition.kind === "OperationDefinition" &&
//       definition.operation === "subscription"
//     )
//   },
//   wsLink,
//   httpLink
// )

// ----------------------------------------------------------------

// ------------------------------------------------------------------------------------------------

// Создаем схему
const schema = makeExecutableSchema({
  typeDefs: mergedTypeDefs,
  resolvers: mergedResolvers
})

// Создаем WebSocket сервер
const wsServer = new WebSocketServer({
  server: httpServer,
  path: "/graphql"
})

// Используем WebSocket сервер с graphql-ws
const serverCleanup = useServer(
  {
    schema
  },
  wsServer
)

const server = new ApolloServer({
  schema,
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
    }
  ],
  context: async ({ req }) => {
    const token = req.headers.authorization || ""
    let user = null

    if (token) {
      try {
        const decoded = jwt.verify(token, process.env.JWT_SECRET)
        user = await prisma.user.findUnique({ where: { id: decoded.userId } })
      } catch (e) {
        console.error(e)
      }
    }
    return { user }
  }
})

await server.start()

app.use("/", cors(), express.json(), expressMiddleware(server))
app.use(authMiddleware)

app.post("/register", adminMiddleware, async (req, res) => {
  const { name, email, login, password, role } = req.body

  try {
    const hashedPassword = await argon2.hash(password)
    const newUser = await prisma.user.create({
      data: {
        name,
        email,
        login,
        password: hashedPassword,
        role: role || "user"
      }
    })

    res.json(newUser)
  } catch (error) {
    res.status(500).json({ error: error.message })
  }
})

await new Promise((resolve) =>
  httpServer.listen({ port: 4000, host: "0.0.0.0" }, resolve)
)
// await new Promise((resolve) => httpsServer.listen({ port: 4000, host: '0.0.0.0' }, resolve));

console.log(`🚀 Server ready at http://localhost:4000/graphql/`)
