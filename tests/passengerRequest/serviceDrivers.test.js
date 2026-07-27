import test from "node:test"
import assert from "node:assert/strict"
import {
  ensureDriverIds,
  findStaleDriverLinks,
  linkTargetsDriver,
  readLinkDriverIndex
} from "../../services/passengerRequest/serviceDrivers.js"

const pwaLink = ({ driverIndex, driverId }) => {
  let url = `https://far.karsavia.ru/external-login?kind=EXTERNAL_USER&token=t&passengerRequestId=req1&driverIndex=${driverIndex}`
  if (driverId) url += `&driverId=${driverId}`
  return `${url}&serviceKind=baggage`
}

let counter = 0
const makeId = () => `id-${++counter}`
const resetIds = () => {
  counter = 0
}

test("ensureDriverIds: проставляет id только тем, у кого его нет", () => {
  resetIds()
  const out = ensureDriverIds(
    [{ fullName: "Иванов", id: "keep-me" }, { fullName: "Петров" }],
    makeId
  )
  assert.equal(out[0].id, "keep-me")
  assert.equal(out[1].id, "id-1")
})

test("ensureDriverIds: пустая строка и пробелы считаются отсутствующим id", () => {
  resetIds()
  const out = ensureDriverIds([{ id: "" }, { id: "   " }, { id: null }], makeId)
  assert.deepEqual(
    out.map((d) => d.id),
    ["id-1", "id-2", "id-3"]
  )
})

test("ensureDriverIds: остальные поля водителя не теряются, исходный массив не мутируется", () => {
  resetIds()
  const drivers = [{ fullName: "Иванов", baggageTags: ["FV1"], linkPWA: "x" }]
  const out = ensureDriverIds(drivers, makeId)
  assert.equal(out[0].fullName, "Иванов")
  assert.deepEqual(out[0].baggageTags, ["FV1"])
  assert.equal(out[0].linkPWA, "x")
  assert.equal(drivers[0].id, undefined)
})

test("ensureDriverIds: не массив → пустой массив", () => {
  assert.deepEqual(ensureDriverIds(undefined), [])
  assert.deepEqual(ensureDriverIds(null), [])
})

test("readLinkDriverIndex: достаёт индекс, на который выпущена ссылка", () => {
  assert.equal(readLinkDriverIndex(pwaLink({ driverIndex: 2 })), 2)
  assert.equal(readLinkDriverIndex(pwaLink({ driverIndex: 0 })), 0)
})

test("readLinkDriverIndex: мусор и отсутствие параметра → null", () => {
  assert.equal(readLinkDriverIndex(null), null)
  assert.equal(readLinkDriverIndex("не ссылка"), null)
  assert.equal(readLinkDriverIndex("https://far.karsavia.ru/external-login?token=t"), null)
})

test("linkTargetsDriver: ссылка с driverId адресует именно этого водителя", () => {
  const link = pwaLink({ driverIndex: 2, driverId: "abc" })
  assert.equal(linkTargetsDriver(link, "abc"), true)
  assert.equal(linkTargetsDriver(link, "other"), false)
})

test("linkTargetsDriver: ссылка без driverId адресует индексом → не привязана", () => {
  assert.equal(linkTargetsDriver(pwaLink({ driverIndex: 2 }), "abc"), false)
  assert.equal(linkTargetsDriver(null, "abc"), false)
})

test("findStaleDriverLinks: после удаления из середины съехавшие legacy-ссылки помечены", () => {
  // было 0,1,2,3 → удалён 1 → выжившие 0,1(бывший 2),2(бывший 3)
  const survivors = ensureDriverIds(
    [
      { fullName: "A", linkPWA: pwaLink({ driverIndex: 0 }) },
      { fullName: "C", linkPWA: pwaLink({ driverIndex: 2 }) },
      { fullName: "D", linkPWA: pwaLink({ driverIndex: 3 }) }
    ],
    makeId
  )
  const stale = findStaleDriverLinks(survivors, 1)
  assert.deepEqual(
    stale.map((s) => s.index),
    [1, 2]
  )
  assert.deepEqual(
    stale.map((s) => s.driver.fullName),
    ["C", "D"]
  )
})

test("findStaleDriverLinks: водители до удалённого не трогаются — их индекс не съехал", () => {
  const survivors = ensureDriverIds(
    [
      { fullName: "A", linkPWA: pwaLink({ driverIndex: 0 }) },
      { fullName: "B", linkPWA: pwaLink({ driverIndex: 1 }) }
    ],
    makeId
  )
  assert.deepEqual(findStaleDriverLinks(survivors, 2), [])
})

test("findStaleDriverLinks: ссылки, привязанные к id, перевыпускать не нужно", () => {
  const survivors = [
    { id: "a", fullName: "A", linkPWA: pwaLink({ driverIndex: 0, driverId: "a" }) },
    { id: "c", fullName: "C", linkPWA: pwaLink({ driverIndex: 2, driverId: "c" }) },
    { id: "d", fullName: "D", linkPWA: pwaLink({ driverIndex: 3, driverId: "d" }) }
  ]
  assert.deepEqual(findStaleDriverLinks(survivors, 1), [])
})

test("findStaleDriverLinks: водитель без ссылки пропускается", () => {
  const survivors = ensureDriverIds(
    [{ fullName: "A" }, { fullName: "C", linkPWA: null }],
    makeId
  )
  assert.deepEqual(findStaleDriverLinks(survivors, 0), [])
})
