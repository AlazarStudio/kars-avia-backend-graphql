import test from "node:test"
import assert from "node:assert/strict"
import { closeOpenChess } from "../../services/passengerRequest/chessHelpers.js"

const AT = new Date("2026-08-10T08:00:00.000Z")

const chess = (overrides = {}) => ({
  hotelIndex: 0,
  hotelName: "Азия",
  startAt: new Date("2026-08-01T10:00:00.000Z"),
  endAt: null,
  reason: null,
  ...overrides
})

test("закрывается ПОСЛЕДНИЙ интервал без endAt, остальные не трогаются", () => {
  const list = [
    chess({ startAt: new Date("2026-08-01T10:00:00.000Z") }),
    chess({
      startAt: new Date("2026-08-02T10:00:00.000Z"),
      endAt: new Date("2026-08-03T10:00:00.000Z"),
      reason: "закрыт"
    }),
    chess({ startAt: new Date("2026-08-04T12:00:00.000Z") })
  ]

  const next = closeOpenChess(list, AT)

  assert.equal(next.length, 3)
  assert.equal(next[0].endAt, null, "первый открытый остаётся открытым")
  assert.equal(
    next[1].endAt.toISOString(),
    "2026-08-03T10:00:00.000Z",
    "закрытый не трогается"
  )
  assert.equal(next[2].endAt, AT, "закрыт именно последний открытый")
})

test("переселение не пишет reason в закрываемый интервал", () => {
  const next = closeOpenChess([chess({ reason: "прошлая причина" })], AT)

  assert.equal(next[0].endAt, AT)
  assert.equal(next[0].reason, "прошлая причина", "прежняя причина сохранена")
})

test("выселение пишет в закрываемый интервал и endAt, и reason", () => {
  const next = closeOpenChess([chess({ reason: "прошлая причина" })], AT, {
    reason: "выселение"
  })

  assert.equal(next[0].endAt, AT)
  assert.equal(next[0].reason, "выселение")
})

test("без открытых интервалов и без degenerate список остаётся как есть", () => {
  const list = [chess({ endAt: new Date("2026-08-03T10:00:00.000Z") })]

  const next = closeOpenChess(list, AT)

  assert.deepEqual(next, list)
})

test("без открытых интервалов с degenerate дописывается вырожденный интервал", () => {
  const list = [chess({ endAt: new Date("2026-08-03T10:00:00.000Z") })]

  const next = closeOpenChess(list, AT, {
    reason: "выселение",
    degenerate: { hotelIndex: 1, hotelName: "Чаплан" }
  })

  assert.equal(next.length, 2)
  assert.deepEqual(next[1], {
    hotelIndex: 1,
    hotelName: "Чаплан",
    startAt: AT,
    endAt: AT,
    reason: "выселение"
  })
})

test("вырожденный интервал берёт гостиницу из degenerate, а не из последнего интервала", () => {
  const next = closeOpenChess(
    [chess({ hotelIndex: 7, hotelName: "Старая", endAt: AT })],
    AT,
    { reason: "выселение", degenerate: { hotelIndex: 0, hotelName: null } }
  )

  assert.equal(next[1].hotelIndex, 0)
  assert.equal(next[1].hotelName, null)
})

test("degenerate не применяется, когда открытый интервал нашёлся", () => {
  const next = closeOpenChess([chess()], AT, {
    reason: "выселение",
    degenerate: { hotelIndex: 0, hotelName: "Азия" }
  })

  assert.equal(next.length, 1, "вырожденный интервал не дописывается")
})

test("пустой и отсутствующий список не падают", () => {
  assert.deepEqual(closeOpenChess([], AT), [])
  assert.deepEqual(closeOpenChess(undefined, AT), [])
  assert.deepEqual(closeOpenChess(null, AT), [])
  assert.deepEqual(
    closeOpenChess([], AT, {
      reason: "выселение",
      degenerate: { hotelIndex: 0, hotelName: "Азия" }
    }),
    [{ hotelIndex: 0, hotelName: "Азия", startAt: AT, endAt: AT, reason: "выселение" }]
  )
})

test("исходный массив и его элементы не мутируются", () => {
  const open = chess()
  const list = [open]
  const snapshot = { ...open }

  closeOpenChess(list, AT, { reason: "выселение" })

  assert.equal(list.length, 1, "длина исходного массива не изменилась")
  assert.equal(list[0], open, "элемент подменён не был")
  assert.deepEqual(open, snapshot, "элемент не изменён на месте")
})

test("закрыть интервал раньше его начала нельзя", () => {
  // Перевёрнутый {startAt > endAt} — это не косметика: по интервалу считаются
  // сутки проживания, то есть деньги.
  assert.throws(
    () =>
      closeOpenChess(
        [chess({ startAt: new Date("2026-08-05T10:00:00.000Z") })],
        new Date("2026-08-04T10:00:00.000Z")
      ),
    (error) => error?.extensions?.code === "BAD_USER_INPUT"
  )
})

test("закрытие ровно в дату начала разрешено: интервал вырожденный, а не перевёрнутый", () => {
  const start = new Date("2026-08-05T10:00:00.000Z")
  const next = closeOpenChess([chess({ startAt: start })], start)

  assert.equal(next[0].endAt, start)
})

test("нечитаемый startAt легаси-документа операцию не блокирует", () => {
  const next = closeOpenChess([chess({ startAt: "не дата" })], AT)

  assert.equal(next[0].endAt, AT)
})
