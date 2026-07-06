import { GraphQLError } from "graphql"
import { prisma } from "../../prisma.js"
import {
  toMaintenanceBannerResponse,
  validateMaintenanceBannerInput
} from "./maintenanceBannerUtils.js"

export async function getMaintenanceBanner(now = new Date()) {
  const record = await prisma.maintenanceBanner.findFirst()
  return toMaintenanceBannerResponse(record, now)
}

export async function updateMaintenanceBanner(input, now = new Date()) {
  try {
    validateMaintenanceBannerInput(input)
  } catch (err) {
    throw new GraphQLError(err.message, {
      extensions: { code: "BAD_USER_INPUT" }
    })
  }

  const message =
    typeof input.message === "string" ? input.message.trim() : ""
  const data = {
    enabled: Boolean(input.enabled),
    message,
    endsAt: input.endsAt ?? null
  }

  const existing = await prisma.maintenanceBanner.findFirst()
  const record = existing
    ? await prisma.maintenanceBanner.update({
        where: { id: existing.id },
        data
      })
    : await prisma.maintenanceBanner.create({ data })

  return toMaintenanceBannerResponse(record, now)
}
