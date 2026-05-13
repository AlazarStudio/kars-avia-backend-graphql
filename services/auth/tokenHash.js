import { createHash, randomBytes } from "crypto"

export function generateOpaqueToken() {
  return randomBytes(32).toString("base64url")
}

export function hashOpaqueToken(raw) {
  if (!raw || typeof raw !== "string") return ""
  return createHash("sha256").update(raw, "utf8").digest("hex")
}
