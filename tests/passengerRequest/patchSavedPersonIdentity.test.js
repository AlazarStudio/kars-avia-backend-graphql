import test from "node:test"
import assert from "node:assert/strict"
import {
  upsertSavedPassenger,
  patchSavedPersonIdentity
} from "../../services/passengerRequest/savedPassengers.js"

test("правка отеля переносит идентичность в ростер (incoming-wins), но НЕ категорию", () => {
  let roster = upsertSavedPassenger([], {
    personId: "p1", fullName: "Old", seat: "12A", personCategory: "ADULT"
  })
  roster = patchSavedPersonIdentity(roster, {
    personId: "p1", fullName: "New", phone: "999", personType: "CREW",
    personCategory: "CHILD", airlinePersonalId: "a1", roomNumber: "101"
  })
  assert.equal(roster.length, 1)
  assert.equal(roster[0].fullName, "New")
  // Категория реестра сильнее правки из услуги: отличить осознанный выбор от
  // подставленного по умолчанию ADULT на бэке невозможно, а цена ошибки —
  // потерянная скидка на проживание. Менять категорию — мутацией реестра.
  assert.equal(roster[0].personCategory, "ADULT")
  assert.equal(roster[0].personType, "CREW")
  assert.equal(roster[0].airlinePersonalId, "a1")
  assert.equal(roster[0].seat, "12A")
})

test("правка услуги не понижает CHILD в реестре до ADULT (дефект №13)", () => {
  let roster = upsertSavedPassenger([], {
    personId: "p1", fullName: "Малой", personCategory: "CHILD"
  })
  // Сервис-персона всегда несёт категорию: форма CRM предзаполняется значением
  // сервис-персоны, поэтому на бэк приходит явный ADULT.
  roster = patchSavedPersonIdentity(roster, {
    personId: "p1", fullName: "Малой", phone: "777", personCategory: "ADULT"
  })
  assert.equal(roster[0].personCategory, "CHILD", "категория реестра уцелела")
  assert.equal(roster[0].phone, "777", "остальные поля правки доехали")
})

test("у записи реестра без категории она берётся из услуги", () => {
  const roster = patchSavedPersonIdentity(
    [{ personId: "p1", fullName: "Легаси" }],
    { personId: "p1", fullName: "Легаси", personCategory: "INFANT" }
  )
  assert.equal(roster[0].personCategory, "INFANT")
})

test("правка воды не затирает CREW personType (у water-персоны нет ключа personType)", () => {
  let roster = upsertSavedPassenger([], {
    personId: "p1", fullName: "Crew One", personType: "CREW",
    airlinePersonalId: "a1", personCategory: "ADULT"
  })
  roster = patchSavedPersonIdentity(roster, {
    personId: "p1", fullName: "Crew One", phone: "111", seat: "2B", personCategory: "ADULT"
  })
  assert.equal(roster[0].personType, "CREW")
  assert.equal(roster[0].airlinePersonalId, "a1")
  assert.equal(roster[0].seat, "2B")
})

test("personId нет в ростере → добавляется новая запись", () => {
  const roster = patchSavedPersonIdentity([], {
    personId: "p9", fullName: "Fresh", personCategory: "CHILD"
  })
  assert.equal(roster.length, 1)
  assert.equal(roster[0].personId, "p9")
  assert.equal(roster[0].personCategory, "CHILD")
})

test("нет personId или пустое ФИО → ростер без изменений", () => {
  assert.deepEqual(
    patchSavedPersonIdentity([{ personId: "p1", fullName: "A" }], { fullName: "X" }),
    [{ personId: "p1", fullName: "A" }]
  )
  assert.deepEqual(
    patchSavedPersonIdentity([], { personId: "p1", fullName: "   " }),
    []
  )
})
