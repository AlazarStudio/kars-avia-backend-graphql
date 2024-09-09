import fs from "fs"
import cors from "cors"
import http from "http"
import https from "https"
import dotenv from "dotenv"
import express from "express"

import { ApolloServer } from "@apollo/server"
import { expressMiddleware } from "@apollo/server/express4"
import { ApolloServerPluginDrainHttpServer } from "@apollo/server/plugin/drainHttpServer"

import { WebSocketServer } from "ws"
import { useServer } from "graphql-ws/lib/use/ws"
import { makeExecutableSchema } from "@graphql-tools/schema"

import { prisma } from "./prisma.js"
import mergedTypeDefs from "./typeDefs/typedefs.js"
import mergedResolvers from "./resolvers/resolvers.js"
import authMiddleware, {
  adminMiddleware
} from "./middlewares/authMiddleware.js"

// ------------------------------------------------------------------------------------------------

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
// await server.applyMiddleware({ app });

app.use("/", cors(), express.json(), expressMiddleware(server))
// app.use(authMiddleware)

// app.post("/register", adminMiddleware, async (req, res) => {
//   const { name, email, login, password, role } = req.body

//   try {
//     const hashedPassword = await argon2.hash(password)
//     const newUser = await prisma.user.create({
//       data: {
//         name,
//         email,
//         login,
//         password: hashedPassword,
//         role: role || "user"
//       }
//     })

//     res.json(newUser)
//   } catch (error) {
//     res.status(500).json({ error: error.message })
//   }
// })

// await new Promise((resolve) =>
//   httpServer.listen({ port: 4000, host: "0.0.0.0" }, resolve)
// )
// await new Promise((resolve) => httpsServer.listen({ port: 4000, host: '0.0.0.0' }, resolve));

// console.log(`🚀 Server ready at http://localhost:${PORT}/graphql/`)


const PORT = 4000;
const HOST = "0.0.0.0"
// Now that our HTTP server is fully set up, we can listen to it.
httpServer.listen({port: PORT}, () => {
  console.log(`Server is now running on http://localhost:${PORT}/graphql`);
});
