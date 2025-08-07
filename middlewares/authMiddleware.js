import jwt from "jsonwebtoken"
import { prisma } from "../prisma.js"
import { logger } from "../utils/logger.js"
import { GraphQLError } from "graphql"
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
  const user = context.user
  if (!user) {
    throw new GraphQLError("Access forbidden: No user provided.", {
      extensions: {
        code: "UNAUTHORIZED"
      }
    })
  }

  if (!allowedRoles.includes(user.role)) {
    throw new GraphQLError("Access forbidden: Insufficient rights.", {
      extensions: {
        code: "FORBIDDEN"
      }
    })
  }

  await prisma.user.update({
    where: { id: user.id },
    data: { lastSeen: new Date() }
  })
}

//
export const dispatcherModerMiddleware = async (context) => {
  await roleMiddleware(context, [
    "SUPERADMIN",
    "DISPATCHERADMIN",
    "DISPATCHERMODERATOR"
  ])
}

// Специфичные мидлвары для ролей на основе универсального
export const superAdminMiddleware = async (context) => {
  await roleMiddleware(context, ["SUPERADMIN"])
}
export const adminMiddleware = async (context) =>
  await roleMiddleware(context, ["SUPERADMIN", "DISPATCHERADMIN"])

export const adminHotelAirMiddleware = async (context) => {
  await roleMiddleware(context, [
    "SUPERADMIN",
    "DISPATCHERADMIN",
    "HOTELADMIN",
    "AIRLINEADMIN"
  ])
}

export const moderatorMiddleware = async (context) => {
  await roleMiddleware(context, [
    "SUPERADMIN",
    "DISPATCHERADMIN",
    "HOTELADMIN",
    "AIRLINEADMIN",
    "DISPATCHERMODERATOR",
    "HOTELMODERATOR",
    "AIRLINEMODERATOR"
  ])
}

export const hotelAdminMiddleware = async (context) => {
  await roleMiddleware(context, ["SUPERADMIN", "DISPATCHERADMIN", "HOTELADMIN"])
}

export const hotelModerMiddleware = async (context) => {
  await roleMiddleware(context, [
    "SUPERADMIN",
    "DISPATCHERADMIN",
    "DISPATCHERMODERATOR",
    "HOTELADMIN",
    "HOTELMODERATOR"
  ])
}

export const hotelMiddleware = async (context) => {
  await roleMiddleware(context, [
    "SUPERADMIN",
    "DISPATCHERADMIN",
    "HOTELADMIN",
    "HOTELMODERATOR",
    "HOTELUSER"
  ])
}

export const airlineAdminMiddleware = async (context) => {
  await roleMiddleware(context, [
    "SUPERADMIN",
    "DISPATCHERADMIN",
    "AIRLINEADMIN"
  ])
}

export const airlineModerMiddleware = async (context) => {
  await roleMiddleware(context, [
    "SUPERADMIN",
    "DISPATCHERADMIN",
    "DISPATCHERMODERATOR",
    "AIRLINEADMIN",
    "AIRLINEMODERATOR"
  ])
}

export const airlineMiddleware = async (context) => {
  await roleMiddleware(context, [
    "SUPERADMIN",
    "DISPATCHERADMIN",
    "AIRLINEADMIN",
    "AIRLINEMODERATOR",
    "AIRLINEUSER"
  ])
}

export const allMiddleware = async (context) => {
  roleMiddleware(context, [
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
}

// ----------------------------------------------------------------

export default authMiddleware
