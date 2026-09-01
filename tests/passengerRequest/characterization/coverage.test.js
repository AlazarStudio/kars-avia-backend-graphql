// Страж покрытия и формы.
//
// Падает в двух случаях: в резолвере появилась мутация без единого
// характеризационного теста, или изменился набор корневых полей модуля.
// Второе особенно важно при разрезе резолвера на модули: потерянная или
// продублированная при сборке мутация иначе прошла бы незамеченной.
//
// Числа ниже обновляются ОСОЗНАННО: падение «56 !== 55» означает новое
// корневое поле, которое нужно осмотреть и покрыть, а не механически подогнать.

import test from "node:test"
import assert from "node:assert/strict"
import fs from "node:fs"
import path from "node:path"
import { fileURLToPath } from "node:url"
import resolvers from "../../../resolvers/passengerRequest/passengerRequest.resolver.js"
import { releasePubsubAfterTests } from "../../helpers/fapHarness.js"

releasePubsubAfterTests()

const here = path.dirname(fileURLToPath(import.meta.url))

function characterizationSources() {
  return fs
    .readdirSync(here)
    .filter((file) => file.endsWith(".characterization.test.js"))
    .map((file) => fs.readFileSync(path.join(here, file), "utf8"))
}

test("в резолвере ровно 58 мутаций, 2 Query и 2 подписки", () => {
  assert.equal(Object.keys(resolvers.Mutation).length, 58)
  assert.equal(Object.keys(resolvers.Query).length, 2)
  assert.equal(Object.keys(resolvers.Subscription).length, 2)
})

test("набор секций резолвера неизменен", () => {
  assert.deepEqual(Object.keys(resolvers).sort(), [
    "Mutation",
    "PassengerLivingService",
    "PassengerRequest",
    "PassengerRequestHotelReport",
    "PassengerServiceDriver",
    "PassengerServiceDriverPerson",
    "PassengerServiceHotelPerson",
    "Query",
    "Subscription"
  ])
})

test("каждая мутация упомянута хотя бы в одном характеризационном тесте", () => {
  const sources = characterizationSources()
  const missing = Object.keys(resolvers.Mutation).filter(
    (name) => !sources.some((source) => source.includes(name))
  )
  assert.deepEqual(missing, [], `без характеризационного теста: ${missing.join(", ")}`)
})

test("каждая Query упомянута хотя бы в одном характеризационном тесте", () => {
  const sources = characterizationSources()
  const missing = Object.keys(resolvers.Query).filter(
    (name) => !sources.some((source) => source.includes(name))
  )
  assert.deepEqual(missing, [], `без характеризационного теста: ${missing.join(", ")}`)
})

test("страж видит характеризационные файлы, а не пустой список", () => {
  // Защита от самой опасной поломки стража: если фильтр по имени перестанет
  // совпадать, предыдущие тесты станут зелёными на пустом множестве.
  const sources = characterizationSources()
  assert.ok(sources.length >= 9, `найдено файлов: ${sources.length}`)
})
