import express from "express"
import path from "path"
import fs from "fs"
import { buildAuthContext } from "../../middlewares/authContext.js"

const router = express.Router()

const UPLOADS_ROOT = path.join(process.cwd(), "uploads")

router.get("/files/*", async (req, res) => {
  try {
    const authHeader = req.headers.authorization || null
    const context = await buildAuthContext(authHeader)

    if (!context.subject) {
      return res.status(401).json({ error: "Unauthorized" })
    }

    // путь из URL
    const relativePath = req.params[0]
    const absolutePath = path.join(UPLOADS_ROOT, relativePath)

    // защита от ../../
    if (!absolutePath.startsWith(UPLOADS_ROOT)) {
      return res.status(403).json({ error: "Forbidden" })
    }

    if (!fs.existsSync(absolutePath)) {
      return res.status(404).json({ error: "File not found" })
    }

    // TODO: тут можно добавить проверку прав:
    // - принадлежит ли файл заявке пользователя
    // - роль (ADMIN, AIRLINE, HOTEL, etc.)

    res.setHeader("Content-Disposition", "inline")
    res.sendFile(absolutePath)
  } catch (e) {
    res.status(401).json({ error: "Invalid token" })
  }
})

export default router
