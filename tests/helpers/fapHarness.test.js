import test from "node:test"
import assert from "node:assert/strict"
import { pubsub } from "../../services/infra/pubsub.js"
import {
  normalizeSnapshot,
  installPubsubSpy,
  releasePubsubAfterTests
} from "./fapHarness.js"

// Этот файл импортирует pubsub, значит обязан освобождать клиентов Redis.
releasePubsubAfterTests()

test("даты заменяются маркером", () => {
  const snap = normalizeSnapshot({ at: new Date("2026-08-04T10:00:00Z"), name: "x" })
  assert.deepEqual(snap, { at: "<DATE>", name: "x" })
})

test("ISO-строки дат тоже заменяются", () => {
  const snap = normalizeSnapshot({ at: "2026-08-04T10:00:00.000Z" })
  assert.deepEqual(snap, { at: "<DATE>" })
})

test("uuid заменяется маркером, обычные строки нет", () => {
  const snap = normalizeSnapshot({
    personId: "3f1b8a7c-4c2e-4f9b-9d3a-2b7e1c0a5d64",
    fullName: "Иванов Иван"
  })
  assert.deepEqual(snap, { personId: "<UUID>", fullName: "Иванов Иван" })
})

test("вложенные структуры обходятся целиком", () => {
  const snap = normalizeSnapshot({
    hotels: [{ people: [{ personId: "3f1b8a7c-4c2e-4f9b-9d3a-2b7e1c0a5d64", at: new Date() }] }]
  })
  assert.deepEqual(snap, { hotels: [{ people: [{ personId: "<UUID>", at: "<DATE>" }] }] })
})

test("порядок ключей не влияет на сравнение снимков", () => {
  assert.deepEqual(normalizeSnapshot({ b: 2, a: 1 }), normalizeSnapshot({ a: 1, b: 2 }))
})

test("null и примитивы проходят без изменений", () => {
  assert.equal(normalizeSnapshot(null), null)
  assert.equal(normalizeSnapshot(undefined), undefined)
  assert.equal(normalizeSnapshot(42), 42)
  assert.equal(normalizeSnapshot(true), true)
  assert.equal(normalizeSnapshot("обычная строка"), "обычная строка")
})

test("шпион ловит публикации, проставляет seq и восстанавливает pubsub", async () => {
  const original = pubsub.publish
  const spy = installPubsubSpy()
  try {
    await pubsub.publish("TOPIC", { payload: 1 })
    assert.equal(spy.published.length, 1)
    assert.equal(spy.published[0].topic, "TOPIC")
    assert.deepEqual(spy.published[0].payload, { payload: 1 })
    assert.equal(typeof spy.published[0].seq, "number")
  } finally {
    spy.restore()
  }
  assert.equal(pubsub.publish, original)
})

test("шпион не даёт событию уйти в настоящий pubsub", async () => {
  const spy = installPubsubSpy()
  try {
    await pubsub.publish("TOPIC", { payload: 1 })
    assert.equal(spy.published.length, 1)
  } finally {
    spy.restore()
  }
})
