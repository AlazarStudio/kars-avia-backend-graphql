import test from "node:test"
import assert from "node:assert/strict"
import { normalizeFields, computeConfidence } from "../../services/docRecognition/normalize.js"

test("normalizeFields схлопывает пробелы и приводит рейс к слитному верхнему регистру", () => {
  const f = normalizeFields({
    fullName: "  Иванов   Иван  ",
    flight: "su 1234",
    from: "svo",
    to: "led",
    carrier: "su",
    seat: "12a",
    date: "2026-07-08"
  })
  assert.equal(f.fullName, "Иванов Иван")
  assert.equal(f.flight, "SU1234")
  assert.equal(f.from, "SVO")
  assert.equal(f.to, "LED")
  assert.equal(f.carrier, "SU")
  assert.equal(f.seat, "12A")
  assert.equal(f.date, "2026-07-08")
})

test("normalizeFields подставляет пустые строки для отсутствующих полей", () => {
  const f = normalizeFields({})
  assert.deepEqual(f, { fullName: "", flight: "", from: "", to: "", carrier: "", seat: "", date: "", phone: "" })
})

test("computeConfidence: имя + валидный рейс = 1", () => {
  assert.equal(computeConfidence({ fullName: "Иванов Иван", flight: "SU1234" }), 1)
})

test("computeConfidence: только имя = 0.6", () => {
  assert.equal(computeConfidence({ fullName: "Иванов Иван", flight: "" }), 0.6)
})

test("computeConfidence: пусто = 0", () => {
  assert.equal(computeConfidence({ fullName: "", flight: "" }), 0)
})

test("normalizeFields оставляет от телефона только цифры", () => {
  // Форматирование — забота клиента: он приводит номер к своей маске. Здесь важно
  // лишь снять разделители, чтобы «+7 (918) 609-43-07» и «8 918 609 43 07» не
  // считались разными строками.
  assert.equal(normalizeFields({ phone: "+7 (918) 609-43-07" }).phone, "79186094307")
  assert.equal(normalizeFields({ phone: "8 918 609 43 07" }).phone, "89186094307")
  assert.equal(normalizeFields({ phone: "79186094307" }).phone, "79186094307")
})

test("normalizeFields не выдумывает телефон, которого нет", () => {
  // На посадочном талоне телефона не бывает вовсе — поле обязано остаться пустым.
  assert.equal(normalizeFields({}).phone, "")
  assert.equal(normalizeFields({ phone: null }).phone, "")
  assert.equal(normalizeFields({ phone: "телефон не указан" }).phone, "")
})
