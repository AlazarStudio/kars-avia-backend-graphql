import test from "node:test"
import assert from "node:assert/strict"
import {
  isScopeEnforced,
  evaluateRequestAccess,
  assertCanAccessRequest,
  scopeFilterForQuery
} from "../../services/passengerRequest/fapScopeGuard.js"

const dispatcher = { subjectType: "USER", subject: { id: "u1", role: "SUPERADMIN" } }
// Наблюдение демонстрируется на субъекте АВИАКОМПАНИИ: гостиничные субъекты под
// жёстким режимом безусловно (isHotelSubjectScope) и в наблюдении не бывают.
const airlinePersonal = {
  subjectType: "AIRLINE_PERSONAL",
  subject: { id: "p1", airlineId: "a1" },
  fapOperation: "Query.passengerRequests"
}
const hotelExternal = {
  subjectType: "EXTERNAL_USER",
  subject: { id: "e1", scope: "HOTEL", hotelId: "h1" },
  fapOperation: "Mutation.addPassengerRequestHotelPerson"
}
const own = { id: "r1", airlineId: "a1", livingService: { hotels: [{ hotelId: "h1" }] } }
const foreign = { id: "r2", airlineId: "a2", livingService: { hotels: [{ hotelId: "h2" }] } }

const withEnv = (value, fn) => {
  const prev = process.env.FAP_SCOPE_ENFORCE
  if (value === undefined) delete process.env.FAP_SCOPE_ENFORCE
  else process.env.FAP_SCOPE_ENFORCE = value
  try { return fn() } finally {
    if (prev === undefined) delete process.env.FAP_SCOPE_ENFORCE
    else process.env.FAP_SCOPE_ENFORCE = prev
  }
}

const collect = () => {
  const lines = []
  return { sink: (line) => lines.push(line), lines }
}

test("флаг читается на каждом вызове, а не на загрузке модуля", () => {
  withEnv("true", () => assert.equal(isScopeEnforced(), true))
  withEnv("false", () => assert.equal(isScopeEnforced(), false))
  withEnv(undefined, () => assert.equal(isScopeEnforced(), false))
})

test("по умолчанию режим наблюдения: доступ разрешён, но помечен как отказной", () => {
  withEnv(undefined, () => {
    const { sink, lines } = collect()
    const r = evaluateRequestAccess(airlinePersonal, foreign, { sink })
    assert.equal(r.allowed, true, "в наблюдении не отклоняем")
    assert.equal(r.wouldDeny, true, "но фиксируем, что отклонили бы")
    assert.equal(lines.length, 1)
  })
})

test("в наблюдении разрешённый доступ в лог не пишется", () => {
  withEnv(undefined, () => {
    const { sink, lines } = collect()
    const r = evaluateRequestAccess(airlinePersonal, own, { sink })
    assert.equal(r.allowed, true)
    assert.equal(r.wouldDeny, false)
    assert.equal(lines.length, 0, "шум не нужен")
  })
})

test("запись лога структурная и без персональных данных", () => {
  withEnv(undefined, () => {
    const { sink, lines } = collect()
    evaluateRequestAccess(airlinePersonal, foreign, { sink })
    const payload = JSON.parse(lines[0].replace(/^FAP_SCOPE /, ""))
    assert.equal(payload.subjectType, "AIRLINE_PERSONAL")
    assert.equal(payload.subjectId, "p1")
    assert.equal(payload.scopeKind, "airline")
    assert.equal(payload.requestId, "r2")
    assert.equal(payload.operation, "Query.passengerRequests")
    assert.equal(payload.enforced, false)
    // Состав записи закреплён поимённо, а не регэкспом по подстроке: имя
    // операции ФАП само содержит слово Passenger, и поиск подстроки был бы
    // одновременно и ложноположительным, и слабым. Список ключей ловит
    // регрессию строго: новое поле в записи обязано быть добавлено осознанно.
    assert.deepEqual(Object.keys(payload).sort(), [
      "enforced",
      "externalScope",
      "operation",
      "requestAirlineId",
      "requestId",
      "scopeKind",
      "scopeReason",
      "subjectId",
      "subjectType"
    ])
  })
})

test("при включённом флаге доступ к чужой заявке запрещается", () => {
  withEnv("true", () => {
    const { sink } = collect()
    assert.equal(evaluateRequestAccess(hotelExternal, foreign, { sink }).allowed, false)
    assert.equal(evaluateRequestAccess(hotelExternal, own, { sink }).allowed, true)
  })
})

test("диспетчер не ограничен ни в одном режиме", () => {
  for (const v of [undefined, "true"]) {
    withEnv(v, () => {
      const { sink, lines } = collect()
      assert.equal(evaluateRequestAccess(dispatcher, foreign, { sink }).allowed, true)
      assert.equal(lines.length, 0)
    })
  }
})

test("assertCanAccessRequest бросает FORBIDDEN только при включённом флаге", () => {
  withEnv(undefined, () => {
    const { sink } = collect()
    assert.doesNotThrow(() => assertCanAccessRequest(airlinePersonal, foreign, { sink }))
  })
  withEnv("true", () => {
    const { sink } = collect()
    assert.throws(
      () => assertCanAccessRequest(airlinePersonal, foreign, { sink }),
      (e) => e.extensions?.code === "FORBIDDEN" && e.extensions?.http?.status === 403
    )
  })
})

test("scopeFilterForQuery в наблюдении не меняет выдачу, но пишет запись", () => {
  withEnv(undefined, () => {
    const { sink, lines } = collect()
    const r = scopeFilterForQuery(airlinePersonal, { sink })
    assert.equal(r.filter, null, "в наблюдении фильтр не подмешиваем")
    assert.equal(r.denyAll, false)
    assert.equal(lines.length, 1, "но факт фиксируем")
  })
})

// --- Гостиница: жёсткий режим безусловно, флаг не нужен ---

test("гостиница изолирована и с выключенным флагом: чужая заявка недоступна", () => {
  withEnv(undefined, () => {
    const { sink, lines } = collect()
    assert.equal(evaluateRequestAccess(hotelExternal, foreign, { sink }).allowed, false)
    assert.equal(evaluateRequestAccess(hotelExternal, own, { sink }).allowed, true)
    const payload = JSON.parse(lines[0].replace(/^FAP_SCOPE /, ""))
    assert.equal(payload.enforced, true, "в логе виден фактический режим")
    assert.throws(
      () => assertCanAccessRequest(hotelExternal, foreign, { sink }),
      (e) => e.extensions?.code === "FORBIDDEN" && e.extensions?.http?.status === 403
    )
  })
})

test("гостинице фильтр списка подмешивается и с выключенным флагом", () => {
  withEnv(undefined, () => {
    const { sink } = collect()
    const r = scopeFilterForQuery(hotelExternal, { sink })
    assert.deepEqual(r.filter, {
      livingService: { is: { hotels: { some: { hotelId: "h1" } } } }
    })
    assert.equal(r.denyAll, false)
  })
})

test("гостиничная учётка без hotelId получает отказ и без флага", () => {
  const brokenHotel = {
    subjectType: "EXTERNAL_USER",
    subject: { id: "e9", scope: "HOTEL" }
  }
  withEnv(undefined, () => {
    const { sink } = collect()
    assert.equal(scopeFilterForQuery(brokenHotel, { sink }).denyAll, true)
    assert.equal(evaluateRequestAccess(brokenHotel, own, { sink }).allowed, false)
  })
})

test("scopeFilterForQuery при включённом флаге отдаёт фильтр", () => {
  withEnv("true", () => {
    const { sink } = collect()
    const r = scopeFilterForQuery(hotelExternal, { sink })
    assert.deepEqual(r.filter, {
      livingService: { is: { hotels: { some: { hotelId: "h1" } } } }
    })
    assert.equal(r.denyAll, false)
  })
})

test("scopeFilterForQuery: отказной скоуп при включённом флаге закрывает выдачу", () => {
  const stranger = { subjectType: "DRIVER", subject: { id: "d1" } }
  withEnv("true", () => {
    const { sink } = collect()
    assert.equal(scopeFilterForQuery(stranger, { sink }).denyAll, true)
  })
  withEnv(undefined, () => {
    const { sink } = collect()
    assert.equal(scopeFilterForQuery(stranger, { sink }).denyAll, false)
  })
})

test("диспетчеру фильтр не подмешивается и в жёстком режиме", () => {
  withEnv("true", () => {
    const { sink, lines } = collect()
    const r = scopeFilterForQuery(dispatcher, { sink })
    assert.equal(r.filter, null)
    assert.equal(r.denyAll, false)
    assert.equal(lines.length, 0)
  })
})
