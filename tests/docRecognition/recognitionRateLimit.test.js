import test from "node:test"
import assert from "node:assert/strict"
import { createRecognitionRateLimiter } from "../../services/docRecognition/recognitionRateLimit.js"

test("пропускает вызовы в пределах лимита", () => {
  let now = 1000
  const limiter = createRecognitionRateLimiter({
    limit: 3,
    windowMs: 60000,
    clock: () => now
  })
  assert.equal(limiter.check("u1"), true)
  assert.equal(limiter.check("u1"), true)
  assert.equal(limiter.check("u1"), true)
})

test("отбивает вызов сверх лимита", () => {
  let now = 1000
  const limiter = createRecognitionRateLimiter({
    limit: 2,
    windowMs: 60000,
    clock: () => now
  })
  limiter.check("u1")
  limiter.check("u1")
  assert.equal(limiter.check("u1"), false)
})

test("окно скользящее: старые вызовы выпадают", () => {
  let now = 1000
  const limiter = createRecognitionRateLimiter({
    limit: 2,
    windowMs: 60000,
    clock: () => now
  })
  limiter.check("u1")
  limiter.check("u1")
  assert.equal(limiter.check("u1"), false)
  now += 60001
  assert.equal(limiter.check("u1"), true)
})

test("субъекты считаются независимо", () => {
  let now = 1000
  const limiter = createRecognitionRateLimiter({
    limit: 1,
    windowMs: 60000,
    clock: () => now
  })
  assert.equal(limiter.check("u1"), true)
  assert.equal(limiter.check("u1"), false)
  assert.equal(limiter.check("u2"), true)
})

test("пустой ключ не пропускается", () => {
  const limiter = createRecognitionRateLimiter({ limit: 5, windowMs: 60000 })
  assert.equal(limiter.check(null), false)
  assert.equal(limiter.check(""), false)
  assert.equal(limiter.check(undefined), false)
})

test("память не растёт бесконечно: пустые окна вычищаются", () => {
  let now = 1000
  const limiter = createRecognitionRateLimiter({
    limit: 2,
    windowMs: 1000,
    clock: () => now
  })
  for (let i = 0; i < 50; i++) {
    limiter.check(`u${i}`)
    now += 2000
  }
  assert.ok(limiter.size() < 50, `в памяти осталось ${limiter.size()} ключей`)
})

test("отказ не засчитывается как попытка", () => {
  // Иначе заблокированный клиент, долбящий в цикле, продлевал бы себе
  // блокировку бесконечно.
  let now = 1000
  const limiter = createRecognitionRateLimiter({
    limit: 1,
    windowMs: 1000,
    clock: () => now
  })
  assert.equal(limiter.check("u1"), true)
  now += 500
  assert.equal(limiter.check("u1"), false)
  now += 600
  assert.equal(limiter.check("u1"), true)
})
