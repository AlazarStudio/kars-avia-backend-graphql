// Сторож формы фикстуры: composite-объекты в ней обязаны состоять только из
// полей, которые есть в схеме.
//
// Повод: фикстура годами клала в PassengerStatusTimes поле createdAt, которого
// в композите нет. Бой такой запрос отбивает («Cannot query field "createdAt"
// on type "PassengerStatusTimes"»), а тесты на этом поле спокойно ассертили —
// то есть закрепляли форму документа, которой не бывает. Стоило это около
// сорока ассертов в одиннадцати файлах.
//
// Связи между фикстурой и schema.prisma не было вовсе; этот тест её и создаёт.

import test from "node:test"
import assert from "node:assert/strict"
import fs from "node:fs"
import path from "node:path"
import { fileURLToPath } from "node:url"
import { makeRequest } from "./fixtures/passengerRequest.js"

const here = path.dirname(fileURLToPath(import.meta.url))
const schema = fs.readFileSync(
  path.join(here, "..", "..", "prisma", "schema.prisma"),
  "utf8"
)

// Разбор намеренно примитивный: нужен список имён полей одного composite,
// а не модель схемы. Полноценный парсер здесь был бы дороже задачи.
function compositeFields(typeName) {
  const start = schema.indexOf(`type ${typeName} {`)
  assert.notEqual(start, -1, `в схеме нет типа ${typeName}`)
  const end = schema.indexOf("\n}", start)
  return schema
    .slice(start, end)
    .split("\n")
    .slice(1)
    .map((line) => line.trim())
    .filter((line) => line && !line.startsWith("//") && !line.startsWith("@@"))
    .map((line) => line.split(/\s+/)[0])
}

const SERVICE_FIELDS = [
  "waterService",
  "mealService",
  "livingService",
  "transferService",
  "departureTransferService",
  "intercityTransferService",
  "baggageDeliveryService"
]

test("отметки времени в фикстуре описаны полями PassengerStatusTimes", () => {
  const allowed = new Set(compositeFields("PassengerStatusTimes"))
  // Предпосылка: разбор нашёл именно те четыре поля. Без неё пустой список
  // сделал бы тест зелёным на любой фикстуре.
  assert.deepEqual(
    [...allowed].sort(),
    ["acceptedAt", "cancelledAt", "finishedAt", "inProgressAt"],
    "разбор схемы дал не тот набор полей"
  )

  const request = makeRequest()
  const targets = [["statusTimes", request.statusTimes]]
  for (const field of SERVICE_FIELDS) {
    targets.push([`${field}.times`, request[field]?.times])
  }

  for (const [label, times] of targets) {
    for (const key of Object.keys(times || {})) {
      assert.ok(allowed.has(key), `${label}: поля «${key}» нет в PassengerStatusTimes`)
    }
  }
})
