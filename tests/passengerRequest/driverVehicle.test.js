import test from "node:test"
import assert from "node:assert/strict"
import {
  catalogVehicleNumber,
  resetCatalogVehicleCache
} from "../../services/passengerRequest/driverVehicle.js"

// Фейковый справочник: считает вызовы и запоминает where/take, чтобы проверить
// порядок поиска (телефон → имя) и то, что лишних походов в базу нет.
const makeDeps = (rows) => {
  const calls = []
  let nowMs = 0
  return {
    calls,
    setNow: (ms) => {
      nowMs = ms
    },
    deps: {
      findDrivers: async (where, take) => {
        calls.push({ where, take })
        return rows[calls.length - 1] ?? []
      },
      now: () => nowMs
    }
  }
}

test("телефон совпал — номер из справочника, поиск по имени не делается", async () => {
  resetCatalogVehicleCache()
  const { calls, deps } = makeDeps([[{ vehicleNumber: "А123БВ 05" }]])
  const value = await catalogVehicleNumber(
    { phone: "+79186094307", fullName: "Иванов Иван" },
    deps
  )
  assert.equal(value, "А123БВ 05")
  assert.equal(calls.length, 1)
  assert.deepEqual(calls[0], { where: { number: "+79186094307" }, take: 1 })
})

test("телефона нет, имя однозначно — номер по имени без учёта регистра", async () => {
  resetCatalogVehicleCache()
  const { calls, deps } = makeDeps([[{ vehicleNumber: "В777АА 05" }]])
  const value = await catalogVehicleNumber({ fullName: "Иванов Иван" }, deps)
  assert.equal(value, "В777АА 05")
  assert.equal(calls.length, 1)
  assert.deepEqual(calls[0], {
    where: { name: { equals: "Иванов Иван", mode: "insensitive" } },
    take: 2
  })
})

test("имя неоднозначно — номер не подставляем", async () => {
  resetCatalogVehicleCache()
  const { deps } = makeDeps([
    [{ vehicleNumber: "А111АА 05" }, { vehicleNumber: "В222ВВ 05" }]
  ])
  const value = await catalogVehicleNumber({ fullName: "Иванов Иван" }, deps)
  assert.equal(value, null)
})

test("ни телефона, ни имени — null, в базу не ходим", async () => {
  resetCatalogVehicleCache()
  const { calls, deps } = makeDeps([])
  const blank = { phone: "  ", fullName: "" }
  assert.equal(await catalogVehicleNumber(blank, deps), null)
  assert.equal(await catalogVehicleNumber(null, deps), null)
  assert.equal(calls.length, 0)
})

test("у найденного водителя номер пустой — null", async () => {
  resetCatalogVehicleCache()
  const { deps } = makeDeps([[{ vehicleNumber: "   " }]])
  const value = await catalogVehicleNumber({ phone: "+79186094307" }, deps)
  assert.equal(value, null)
})

test("кэш живёт 60 с: второй вызов без запроса, после протухания — снова запрос", async () => {
  resetCatalogVehicleCache()
  const { calls, setNow, deps } = makeDeps([
    [{ vehicleNumber: "А123БВ 05" }],
    [{ vehicleNumber: "С999СС 05" }]
  ])
  const driver = { phone: "+79186094307", fullName: "Иванов Иван" }

  assert.equal(await catalogVehicleNumber(driver, deps), "А123БВ 05")
  assert.equal(await catalogVehicleNumber(driver, deps), "А123БВ 05")
  assert.equal(calls.length, 1)

  setNow(61 * 1000)
  assert.equal(await catalogVehicleNumber(driver, deps), "С999СС 05")
  assert.equal(calls.length, 2)
})

test("резолвер поля: хранимое значение первично, в справочник не ходит", async () => {
  resetCatalogVehicleCache()
  const { default: resolvers } = await import(
    "../../resolvers/passengerRequest/fields.resolver.js"
  )
  const value = await resolvers.PassengerServiceDriver.vehicleNumber({
    vehicleNumber: "X",
    phone: "+79186094307",
    fullName: "Иванов Иван"
  })
  assert.equal(value, "X")
})
