// Сравнение патча с тем, что уже лежит в заявке. От ответа зависит, случится
// ли вообще запись, история и письмо участникам, поэтому спорные случаи
// закреплены поимённо: ложное «изменилось» стоит лишнего письма, а ложное «не
// изменилось» молча проглотит правку пользователя.

import test from "node:test"
import assert from "node:assert/strict"
import { patchIsNoop } from "../../services/passengerRequest/patchIsNoop.js"

test("одинаковые примитивы — изменений нет", () => {
  assert.equal(
    patchIsNoop(
      { flightNumber: "TEST001", status: "CREATED", plannedPassengersCount: 4 },
      { flightNumber: "TEST001", status: "CREATED", plannedPassengersCount: 4 }
    ),
    true
  )
})

test("изменённый примитив — изменение", () => {
  assert.equal(
    patchIsNoop({ flightNumber: "TEST001" }, { flightNumber: "TEST002" }),
    false
  )
  assert.equal(
    patchIsNoop({ plannedPassengersCount: 4 }, { plannedPassengersCount: 5 }),
    false
  )
  // Число и строка того же вида — разные значения: запись сменила бы тип поля.
  assert.equal(
    patchIsNoop({ plannedPassengersCount: 4 }, { plannedPassengersCount: "4" }),
    false
  )
})

test("Date и равная ей ISO-строка — одно и то же значение", () => {
  // Prisma отдаёт дату объектом, из GraphQL она приходит строкой. Запись
  // строки поверх равной ей даты документ не меняет.
  const iso = "2026-08-04T00:00:00.000Z"
  assert.equal(
    patchIsNoop({ flightDate: new Date(iso) }, { flightDate: iso }),
    true
  )
  assert.equal(
    patchIsNoop({ flightDate: iso }, { flightDate: new Date(iso) }),
    true
  )
  assert.equal(
    patchIsNoop({ flightDate: new Date(iso) }, { flightDate: new Date(iso) }),
    true
  )
  assert.equal(
    patchIsNoop(
      { flightDate: new Date(iso) },
      { flightDate: "2026-08-05T00:00:00.000Z" }
    ),
    false
  )
})

test("датой считается только настоящая Date, строки как даты не разбираются", () => {
  // Иначе «12» сравнялось бы со всем, что Date сумел распарсить.
  assert.equal(patchIsNoop({ routeFrom: "12" }, { routeFrom: 12 }), false)
  assert.equal(
    patchIsNoop(
      { routeFrom: "2026-08-04" },
      { routeFrom: "2026-08-04T00:00:00.000Z" }
    ),
    false
  )
  // Другая текстовая форма той же даты — тоже изменение: сомнение решается в
  // безопасную сторону.
  assert.equal(
    patchIsNoop(
      { flightDate: new Date("2026-08-04T00:00:00.000Z") },
      { flightDate: "2026-08-04" }
    ),
    false
  )
})

test("порядок ключей во вложенном объекте не значим", () => {
  assert.equal(
    patchIsNoop(
      {
        waterService: {
          plan: { enabled: true, peopleCount: 4 },
          status: "NEW"
        }
      },
      {
        waterService: {
          status: "NEW",
          plan: { peopleCount: 4, enabled: true }
        }
      }
    ),
    true
  )
})

test("ключа нет в заявке — изменение", () => {
  assert.equal(patchIsNoop({}, { flightNumber: "TEST001" }), false)
  // Даже когда присланное значение пустое: в документе ключа не было вовсе.
  assert.equal(patchIsNoop({}, { routeFrom: "" }), false)
})

test("порядок элементов массива значим", () => {
  // Порядок людей в списке — часть данных, перестановка это правка.
  assert.equal(patchIsNoop({ files: ["a", "b"] }, { files: ["b", "a"] }), false)
  assert.equal(patchIsNoop({ files: ["a", "b"] }, { files: ["a", "b"] }), true)
  assert.equal(patchIsNoop({ files: ["a", "b"] }, { files: ["a"] }), false)
})

test("null против отсутствующего значения — изменение", () => {
  assert.equal(patchIsNoop({}, { routeTo: null }), false)
  assert.equal(patchIsNoop({ routeTo: undefined }, { routeTo: null }), false)
  assert.equal(patchIsNoop({ routeTo: null }, { routeTo: null }), true)
})

test("пустой патч — изменений нет", () => {
  assert.equal(patchIsNoop({ flightNumber: "TEST001" }, {}), true)
})

test("вложенные объекты и массивы сравниваются вглубь", () => {
  const service = () => ({
    plan: {
      enabled: true,
      peopleCount: 4,
      plannedAt: "2026-08-04T09:00:00.000Z"
    },
    status: "IN_PROGRESS",
    people: [
      { personId: "p-1", fullName: "Иванов Иван", baggageTags: ["A1", "A2"] }
    ]
  })

  assert.equal(
    patchIsNoop({ waterService: service() }, { waterService: service() }),
    true
  )

  const deepChange = service()
  deepChange.people[0].baggageTags[1] = "A3"
  assert.equal(
    patchIsNoop({ waterService: service() }, { waterService: deepChange }),
    false
  )

  const planChange = service()
  planChange.plan.plannedAt = "2026-08-04T10:00:00.000Z"
  assert.equal(
    patchIsNoop({ waterService: service() }, { waterService: planChange }),
    false
  )

  // Дата в глубине приводится к ISO так же, как на верхнем уровне.
  const dateInDepth = service()
  dateInDepth.plan.plannedAt = new Date("2026-08-04T09:00:00.000Z")
  assert.equal(
    patchIsNoop({ waterService: service() }, { waterService: dateInDepth }),
    true
  )
})
