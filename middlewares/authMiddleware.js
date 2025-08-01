import jwt from "jsonwebtoken"
import { prisma } from "../prisma.js"
import { logger } from "../utils/logger.js"
import { error } from "console"

// Общий мидлвар для авторизации
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
    // -------- 2FA -------- ↓↓↓↓
    if (user.is2FAEnabled && !req.headers["x-2fa-token"]) {
      return res.status(403).json({ message: "2FA token missing" })
    }
    req.user = user // Добавляем пользователя в запрос
    next()
  } catch (error) {
    logger.error("Ошибка токена", error)
    return res.status(401).json({ message: "Invalid token" })
  }
}

// ----------------------------------------------------------------

// Универсальный мидлвар для проверки ролей

/*

export const roleMiddleware = (context, allowedRoles) => {
  const { user } = context
  if (!user || !allowedRoles.includes(user.role)) {
    throw new Error("Access forbidden: Insufficient rights.")
  }
}
  
*/

export const roleMiddleware = async (context, allowedRoles) => {
  const authHeader = context.authHeader
  if (authHeader === undefined || authHeader === null || !authHeader ) {
    throw new Error("Access forbidden: No token provided.")
  }
  const token = authHeader.split(" ")[1]
  if (!token) {
    throw new Error("Access forbidden: Invalid token format.")
  }
  let decoded
  try {
    decoded = jwt.verify(token, process.env.JWT_SECRET)
  } catch (err) {
    throw new Error("Access forbidden: Invalid or expired token.")
  }
  if (!decoded.role || !allowedRoles.includes(decoded.role)) {
    throw new Error("Access forbidden: Insufficient rights.")
  }
  const { user } = context
  try {
    await prisma.user.update({
      where: { id: user.id },
      data: { lastSeen: new Date() }
    })
  } catch (e) {
    throw new Error("error" + e)
  }
}

export const roleMiddlewareS = async (context, allowedRoles) => {
  // console.log(
  //   "\n context - " + context,
  //   "\n context str - " + JSON.stringify(context)
  // )
  const authHeader = context.authHeader
  if (!authHeader) {
    // console.error("Access forbidden: No token provided.")
    throw new Error("Access forbidden: No token provided.")
  }
  const token = authHeader.split(" ")[1]
  if (!token) {
    // console.error("Access forbidden: Invalid token format.")
    throw new Error("Access forbidden: Invalid token format.")
  }
  let decoded
  try {
    decoded = jwt.verify(token, process.env.JWT_SECRET)
  } catch (err) {
    // console.error("Access forbidden: Invalid or expired token.")
    throw new Error("Access forbidden: Invalid or expired token.")
  }
  if (!decoded.role || !allowedRoles.includes(decoded.role)) {
    // console.error("Access forbidden: Insufficient rights.")
    throw new Error("Access forbidden: Insufficient rights.")
  }
  const { user } = context
  try {
    await prisma.user.update({
      where: { id: user.id },
      data: { lastSeen: new Date() }
    })
  } catch (e) {
    console.error("error" + e)
    // throw new Error("error" + e)
  }
}

//
export const dispatcherModerMiddleware = (context) => {
  roleMiddleware(context, [
    "SUPERADMIN",
    "DISPATCHERADMIN",
    "DISPATCHERMODERATOR"
  ])
}

// Специфичные мидлвары для ролей на основе универсального
export const superAdminMiddleware = (context) =>
  roleMiddleware(context, ["SUPERADMIN"])

export const adminMiddleware = (context) =>
  roleMiddleware(context, ["SUPERADMIN", "DISPATCHERADMIN"])

export const adminHotelAirMiddleware = (context) =>
  roleMiddleware(context, [
    "SUPERADMIN",
    "DISPATCHERADMIN",
    "HOTELADMIN",
    "AIRLINEADMIN"
  ])

export const moderatorMiddleware = (context) =>
  roleMiddleware(context, [
    "SUPERADMIN",
    "DISPATCHERADMIN",
    "HOTELADMIN",
    "AIRLINEADMIN",
    "DISPATCHERMODERATOR",
    "HOTELMODERATOR",
    "AIRLINEMODERATOR"
  ])

export const hotelAdminMiddleware = (context) =>
  roleMiddleware(context, ["SUPERADMIN", "DISPATCHERADMIN", "HOTELADMIN"])

export const hotelModerMiddleware = (context) =>
  roleMiddleware(context, [
    "SUPERADMIN",
    "DISPATCHERADMIN",
    "DISPATCHERMODERATOR",
    "HOTELADMIN",
    "HOTELMODERATOR"
  ])

export const hotelMiddleware = (context) =>
  roleMiddleware(context, [
    "SUPERADMIN",
    "DISPATCHERADMIN",
    "HOTELADMIN",
    "HOTELMODERATOR",
    "HOTELUSER"
  ])

export const airlineAdminMiddleware = (context) =>
  roleMiddleware(context, ["SUPERADMIN", "DISPATCHERADMIN", "AIRLINEADMIN"])

export const airlineModerMiddleware = (context) =>
  roleMiddleware(context, [
    "SUPERADMIN",
    "DISPATCHERADMIN",
    "DISPATCHERMODERATOR",
    "AIRLINEADMIN",
    "AIRLINEMODERATOR"
  ])

export const airlineMiddleware = (context) =>
  roleMiddleware(context, [
    "SUPERADMIN",
    "DISPATCHERADMIN",
    "AIRLINEADMIN",
    "AIRLINEMODERATOR",
    "AIRLINEUSER"
  ])

export const allMiddleware = (context) =>
  roleMiddlewareS(context, [
    "SUPERADMIN",
    "DISPATCHERADMIN",
    "HOTELADMIN",
    "AIRLINEADMIN",
    "DISPATCHERMODERATOR",
    "HOTELMODERATOR",
    "AIRLINEMODERATOR",
    "DISPATCHERUSER",
    "HOTELUSER",
    "AIRLINEUSER",
    "USER"
  ])

// ----------------------------------------------------------------

export default authMiddleware
