import test from "node:test"
import assert from "node:assert/strict"
import { passengerAnalyticsVerdict } from "../../services/analytics/passengerAnalyticsAccess.js"

test("суперадмин проходит без accessMenu", () => {
  assert.equal(passengerAnalyticsVerdict({ role: "SUPERADMIN", menu: null }), "ok")
  assert.equal(
    passengerAnalyticsVerdict({
      role: "SUPERADMIN",
      menu: { analyticsPassengerMenu: false }
    }),
    "ok"
  )
})

test("право снято явно — отказ", () => {
  assert.equal(
    passengerAnalyticsVerdict({
      role: "DISPATCHERADMIN",
      menu: { analyticsPassengerMenu: false }
    }),
    "forbidden"
  )
  assert.equal(
    passengerAnalyticsVerdict({
      role: "AIRLINEADMIN",
      menu: { analyticsPassengerMenu: false }
    }),
    "forbidden"
  )
})

test("право включено — проход", () => {
  assert.equal(
    passengerAnalyticsVerdict({
      role: "AIRLINEADMIN",
      menu: { analyticsPassengerMenu: true }
    }),
    "ok"
  )
})

// mergeAccessMenus отдаёт null для учётки без отдела, должности и user.accessMenu.
// Жёсткое «нет ключа → отказ» отрезало бы тех, кто запрос делает сегодня, поэтому
// режем только по явному false: при @default(true) он появляется лишь тогда,
// когда админ снял тумблер руками.
test("меню не настроено — проход", () => {
  assert.equal(passengerAnalyticsVerdict({ role: "AIRLINEADMIN", menu: null }), "ok")
  assert.equal(passengerAnalyticsVerdict({ role: "AIRLINEADMIN", menu: {} }), "ok")
})
