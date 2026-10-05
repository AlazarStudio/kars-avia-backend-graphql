// Ссылки входа гостиниц, водителей и представителя несут сырой токен
// магик-линка. Заявку читают все её участники, поэтому без маски на типе
// любой из них получал ссылки соседей и входил под ними (аудит 152-ФЗ, U5).
// Здесь закрепляется: значение видит только диспетчер, остальные — null.

import test from "node:test"
import assert from "node:assert/strict"
import resolvers from "../../resolvers/passengerRequest/passengerRequest.resolver.js"
import { releasePubsubAfterTests } from "../helpers/fapHarness.js"
import {
  makeHotelContext,
  makeHotelRoleContext
} from "./fixtures/passengerRequest.js"

releasePubsubAfterTests()

const LINK_FIELDS = [
  ["PassengerServiceHotel", "link"],
  ["PassengerServiceHotel", "linkCRM"],
  ["PassengerServiceHotel", "linkPWA"],
  ["PassengerServiceDriver", "link"],
  ["PassengerServiceDriver", "linkPWA"],
  ["PassengerRepresentativeLink", "linkCRM"],
  ["PassengerRepresentativeLink", "linkPWA"]
]

const parent = {
  link: "https://crm.test/auth?token=raw-link",
  linkCRM: "https://crm.test/auth?token=raw-crm",
  linkPWA: "https://pwa.test/auth?token=raw-pwa"
}

const dispatcherContext = (role) => ({
  subjectType: "USER",
  subject: { id: "u-disp", role }
})

const driverContext = () => ({
  subjectType: "EXTERNAL_USER",
  subject: { id: "ext-driver", scope: "DRIVER", passengerRequestId: "req-1" }
})

const representativeContext = () => ({
  subjectType: "EXTERNAL_USER",
  subject: {
    id: "ext-rep",
    scope: "REPRESENTATIVE",
    airlineId: "airline-1",
    airportId: "airport-1"
  }
})

const resolve = (type, field, context, source = parent) =>
  resolvers[type][field](source, {}, context)

for (const role of ["SUPERADMIN", "DISPATCHERADMIN", "DISPATCHERMODERATOR"]) {
  test(`ссылки входа: диспетчер ${role} получает значение`, () => {
    for (const [type, field] of LINK_FIELDS) {
      assert.equal(
        resolve(type, field, dispatcherContext(role)),
        parent[field],
        `${type}.${field}`
      )
    }
  })
}

const outsiders = [
  ["гостиница в CRM (HOTELADMIN)", () => makeHotelRoleContext("hotel-1")],
  ["гостиница по магик-линку", () => makeHotelContext("hotel-1")],
  ["внешний водитель", driverContext],
  ["представитель", representativeContext],
  ["пустой контекст", () => ({})],
  ["контекста нет", () => undefined]
]

for (const [label, makeViewer] of outsiders) {
  test(`ссылки входа: ${label} получает null`, () => {
    for (const [type, field] of LINK_FIELDS) {
      assert.equal(resolve(type, field, makeViewer()), null, `${type}.${field}`)
    }
  })
}

test("ссылки входа: у диспетчера отсутствующее поле — null, не undefined", () => {
  for (const [type, field] of LINK_FIELDS) {
    assert.equal(
      resolve(type, field, dispatcherContext("DISPATCHERADMIN"), {}),
      null,
      `${type}.${field}`
    )
  }
})

test("ссылки входа: соседние поля водителя не задеты маской", () => {
  const driver = { ...parent, people: [{ fullName: "Пассажир" }], driverCost: 5300 }
  const hotelViewer = makeHotelRoleContext("hotel-1")
  assert.deepEqual(resolvers.PassengerServiceDriver.people(driver), driver.people)
  assert.equal(
    resolvers.PassengerServiceDriver.driverCost(driver, {}, dispatcherContext("DISPATCHERADMIN")),
    5300
  )
  assert.equal(resolvers.PassengerServiceDriver.driverCost(driver, {}, hotelViewer), null)
})
