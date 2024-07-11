import jwt from "jsonwebtoken"
import { prisma } from "../prisma.js"

const authMiddleware = async (req, res, next) => {
  const token = req.headers.authorization

  if (!token) {
    return res.status(401).json({ message: "Authorization token missing" })
  }

  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET)
    const user = await prisma.user.findUnique({ where: { id: decoded.userId } })

    if (!user) {
      return res.status(401).json({ message: "User not found" })
    }

    req.user = user
    next()
  } catch (error) {
    return res.status(401).json({ message: "Invalid token" })
  }
}

export const adminMiddleware = (req, res, next) => {
  if (req.user.role !== "admin") {
    return res.status(403).json({ message: "Access forbidden: Admins only" })
  }

  next()
}

export default authMiddleware
