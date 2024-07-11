import { ApolloServer } from "@apollo/server"
import { expressMiddleware } from "@apollo/server/express4"
import { ApolloServerPluginDrainHttpServer } from "@apollo/server/plugin/drainHttpServer"
import express from "express"
import http from "http"
import cors from "cors"
import dotenv from "dotenv"

import { prisma } from "./prisma.js"
import mergedResolvers from "./resolvers/index.js"
import mergedTypeDefs from "./typeDefs/index.js"
import authMiddleware, {
  adminMiddleware
} from "./middlewares/authMiddleware.js"

dotenv.config()
const app = express()

const httpServer = http.createServer(app)

const server = new ApolloServer({
  typeDefs: mergedTypeDefs,
  resolvers: mergedResolvers,
  plugins: [ApolloServerPluginDrainHttpServer({ httpServer })],
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

// Modified server startup
await new Promise((resolve) => httpServer.listen({ port: 4000 }, resolve))

console.log(`🚀 Server ready at http://localhost:4000/`)
