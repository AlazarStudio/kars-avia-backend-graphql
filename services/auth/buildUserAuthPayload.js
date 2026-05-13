import jwt from "jsonwebtoken"

export function buildUserAuthPayload({ user, sessionToken }) {
  const token = jwt.sign(
    {
      subjectType: "USER",
      userId: user.id,
      role: user.role,
      hotelId: user.hotelId,
      airlineId: user.airlineId,
      airlineDepartmentId: user.airlineDepartmentId,
      dispatcherDepartmentId: user.dispatcherDepartmentId,
      representativeDepartmentId: user.representativeDepartmentId,
      sessionToken
    },
    process.env.JWT_SECRET,
    { expiresIn: "24h" }
  )

  const { password: _omit, ...safeUser } = user
  return {
    ...safeUser,
    token,
    refreshToken: sessionToken
  }
}
