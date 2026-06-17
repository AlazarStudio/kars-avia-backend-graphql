import test from "node:test"
import assert from "node:assert/strict"
import { resolveEmailDelivery } from "../../services/sendMail.js"

function withEnv(overrides, fn) {
  const prev = {
    NODE_ENV: process.env.NODE_ENV,
    EMAIL_ENABLED: process.env.EMAIL_ENABLED,
    EMAIL_RECEIVER: process.env.EMAIL_RECEIVER,
    EMAIL_RESIEVER: process.env.EMAIL_RESIEVER
  }

  for (const [key, value] of Object.entries(overrides)) {
    if (value === undefined) {
      delete process.env[key]
    } else {
      process.env[key] = value
    }
  }

  try {
    return fn()
  } finally {
    for (const [key, value] of Object.entries(prev)) {
      if (value === undefined) {
        delete process.env[key]
      } else {
        process.env[key] = value
      }
    }
  }
}

test("dev + EMAIL_ENABLED=false skips sending", () => {
  withEnv({ NODE_ENV: "dev", EMAIL_ENABLED: "false" }, () => {
    const result = resolveEmailDelivery({
      to: "user@airline.ru",
      subject: "Новая заявка"
    })

    assert.equal(result.skip, true)
    assert.equal(result.reason, "test_mode")
  })
})

test("dev + EMAIL_ENABLED=true redirects to EMAIL_RECEIVER with subject prefix", () => {
  withEnv(
    {
      NODE_ENV: "dev",
      EMAIL_ENABLED: "true",
      EMAIL_RECEIVER: "dev@example.com"
    },
    () => {
      const result = resolveEmailDelivery({
        to: "user@airline.ru",
        subject: "Новая заявка"
      })

      assert.equal(result.skip, false)
      assert.equal(result.actualTo, "dev@example.com")
      assert.equal(result.actualSubject, "[DEV → user@airline.ru] Новая заявка")
      assert.equal(result.redirectedFrom, "user@airline.ru")
    }
  )
})

test("dev + EMAIL_ENABLED=true without EMAIL_RECEIVER skips with warning reason", () => {
  withEnv(
    {
      NODE_ENV: "dev",
      EMAIL_ENABLED: "true",
      EMAIL_RECEIVER: undefined,
      EMAIL_RESIEVER: undefined
    },
    () => {
      const result = resolveEmailDelivery({
        to: "user@airline.ru",
        subject: "Новая заявка"
      })

      assert.equal(result.skip, true)
      assert.equal(result.reason, "missing_receiver")
    }
  )
})

test("production + EMAIL_ENABLED=true sends to original recipient", () => {
  withEnv(
    {
      NODE_ENV: "production",
      EMAIL_ENABLED: "true",
      EMAIL_RECEIVER: "dev@example.com"
    },
    () => {
      const result = resolveEmailDelivery({
        to: "user@airline.ru",
        subject: "Новая заявка"
      })

      assert.equal(result.skip, false)
      assert.equal(result.actualTo, "user@airline.ru")
      assert.equal(result.actualSubject, "Новая заявка")
      assert.equal(result.redirectedFrom, undefined)
    }
  )
})
