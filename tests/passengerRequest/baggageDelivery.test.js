import test from "node:test"
import assert from "node:assert/strict"
import {
  normalizeBaggageTags,
  collectBaggageDriverPatch,
  normalizeDriverPerson,
  normalizeDriversForWrite,
  sumPeopleCost,
  tripReportCost
} from "../../services/passengerRequest/baggageDelivery.js"

test("normalizeBaggageTags: тримит, выкидывает пустые, схлопывает дубли без учёта регистра", () => {
  const out = normalizeBaggageTags([" FV640586 ", "", "fv640586", null, "SU358783", 42])
  assert.deepEqual(out, ["FV640586", "SU358783"])
})

test("normalizeBaggageTags: не массив → пустой массив", () => {
  assert.deepEqual(normalizeBaggageTags(undefined), [])
  assert.deepEqual(normalizeBaggageTags(null), [])
  assert.deepEqual(normalizeBaggageTags("FV1"), [])
})

test("collectBaggageDriverPatch: берёт только присутствующие ключи", () => {
  const applied = collectBaggageDriverPatch({ vehicleType: "Газель" })
  assert.deepEqual(applied, { vehicleType: "Газель" })
})

test("collectBaggageDriverPatch: явный null очищает дату доставки", () => {
  const applied = collectBaggageDriverPatch({ deliveryCompletedAt: null })
  assert.equal(applied.deliveryCompletedAt, null)
  assert.ok("deliveryCompletedAt" in applied)
})

test("collectBaggageDriverPatch: пустой тип ТС нормализуется в null", () => {
  assert.equal(collectBaggageDriverPatch({ vehicleType: "   " }).vehicleType, null)
  assert.equal(collectBaggageDriverPatch({ vehicleType: " легковая " }).vehicleType, "легковая")
})

test("collectBaggageDriverPatch: дата приходит строкой, уходит объектом Date", () => {
  const applied = collectBaggageDriverPatch({
    deliveryCompletedAt: "2026-06-24T06:00:00.000Z"
  })
  assert.ok(applied.deliveryCompletedAt instanceof Date)
  assert.equal(applied.deliveryCompletedAt.toISOString(), "2026-06-24T06:00:00.000Z")
})

test("collectBaggageDriverPatch: пустой патч → пустой объект", () => {
  assert.deepEqual(collectBaggageDriverPatch({}), {})
})

test("collectBaggageDriverPatch: мусорная строка в дате → null", () => {
  const applied = collectBaggageDriverPatch({ deliveryCompletedAt: "вчера" })
  assert.equal(applied.deliveryCompletedAt, null)
})

test("collectBaggageDriverPatch: null патч → пустой объект, не бросает", () => {
  assert.deepEqual(collectBaggageDriverPatch(null), {})
})

test("collectBaggageDriverPatch: бирки на уровне водителя больше не принимаются", () => {
  // Бирки уехали на пассажира: ключ у водителя игнорируется целиком.
  const applied = collectBaggageDriverPatch({ baggageTags: ["FV1"] })
  assert.deepEqual(applied, {})
})

test("collectBaggageDriverPatch: сумма поездки производная и патчем не принимается", () => {
  const applied = collectBaggageDriverPatch({ reportCost: 1500 })
  assert.deepEqual(applied, {})
})

test("collectBaggageDriverPatch: ожидаемое количество пассажиров — целое проходит", () => {
  assert.deepEqual(collectBaggageDriverPatch({ peopleCount: 10 }), { peopleCount: 10 })
})

test("collectBaggageDriverPatch: ожидаемое количество пассажиров — ноль проходит", () => {
  assert.deepEqual(collectBaggageDriverPatch({ peopleCount: 0 }), { peopleCount: 0 })
})

test("collectBaggageDriverPatch: ожидаемое количество пассажиров — null проходит как null", () => {
  const applied = collectBaggageDriverPatch({ peopleCount: null })
  assert.equal(applied.peopleCount, null)
  assert.ok("peopleCount" in applied)
})

test("collectBaggageDriverPatch: ожидаемое количество пассажиров — строка с числом приводится", () => {
  assert.equal(collectBaggageDriverPatch({ peopleCount: "12" }).peopleCount, 12)
})

test("collectBaggageDriverPatch: ожидаемое количество пассажиров — мусор, отрицательное, дробное → null", () => {
  assert.equal(collectBaggageDriverPatch({ peopleCount: "abc" }).peopleCount, null)
  assert.equal(collectBaggageDriverPatch({ peopleCount: -1 }).peopleCount, null)
  assert.equal(collectBaggageDriverPatch({ peopleCount: 1.5 }).peopleCount, null)
})

test("collectBaggageDriverPatch: ожидаемое количество пассажиров — ключа нет, в результате ключа нет", () => {
  const applied = collectBaggageDriverPatch({ vehicleType: "Газель" })
  assert.ok(!("peopleCount" in applied))
})

test("collectBaggageDriverPatch: пассажиры прогоняются через нормализацию", () => {
  const applied = collectBaggageDriverPatch({
    people: [
      {
        fullName: "Иванов",
        baggageTags: [" FV1 ", "fv1", "", "SU2"],
        reportCost: "1500",
        addressTo: "  Ленина 1  "
      }
    ]
  })
  assert.deepEqual(applied.people, [
    {
      fullName: "Иванов",
      baggageTags: ["FV1", "SU2"],
      reportCost: 1500,
      addressTo: "Ленина 1"
    }
  ])
})

test("collectBaggageDriverPatch: пустой список пассажиров сохраняется как пустой", () => {
  const applied = collectBaggageDriverPatch({ people: [] })
  assert.deepEqual(applied.people, [])
})

test("collectBaggageDriverPatch: people: null → пустой список", () => {
  const applied = collectBaggageDriverPatch({ people: null })
  assert.deepEqual(applied.people, [])
})

test("normalizeDriverPerson: легаси-пассажир без ключа baggageTags → []", () => {
  // Prisma отдаёт скалярный список внутри composite-типа как null, а у документов,
  // созданных до появления поля, ключа нет вовсе. В data ни то, ни другое уходить
  // не должно — Mongo/Prisma не примет null в String[].
  const out = normalizeDriverPerson({ fullName: "Петров" })
  assert.deepEqual(out.baggageTags, [])
  assert.ok("baggageTags" in out)
})

test("normalizeDriverPerson: пассажир с baggageTags: null → []", () => {
  const out = normalizeDriverPerson({ fullName: "Иванов", baggageTags: null })
  assert.deepEqual(out.baggageTags, [])
})

test("normalizeDriverPerson: бирки нормализуются", () => {
  const out = normalizeDriverPerson({
    fullName: "Сидоров",
    baggageTags: [" FV1 ", "fv1", "", "SU2"]
  })
  assert.deepEqual(out.baggageTags, ["FV1", "SU2"])
})

test("normalizeDriverPerson: ноль в цене сохраняется как ноль, а не превращается в null", () => {
  const out = normalizeDriverPerson({ fullName: "Иванов", reportCost: 0 })
  assert.equal(out.reportCost, 0)
})

test("normalizeDriverPerson: цена null и отсутствующая цена → null", () => {
  assert.equal(normalizeDriverPerson({ fullName: "Иванов", reportCost: null }).reportCost, null)
  assert.equal(normalizeDriverPerson({ fullName: "Иванов" }).reportCost, null)
})

test("normalizeDriverPerson: нечисловая цена → null", () => {
  assert.equal(normalizeDriverPerson({ fullName: "Иванов", reportCost: "abc" }).reportCost, null)
  assert.equal(normalizeDriverPerson({ fullName: "Иванов", reportCost: NaN }).reportCost, null)
  assert.equal(normalizeDriverPerson({ fullName: "Иванов", reportCost: "  " }).reportCost, null)
})

test("normalizeDriverPerson: числовая строка в цене приводится к числу", () => {
  assert.equal(normalizeDriverPerson({ fullName: "Иванов", reportCost: "1500.5" }).reportCost, 1500.5)
})

test("normalizeDriverPerson: цена округляется до копеек у отдельного пассажира", () => {
  // Хвост от клиента не должен уезжать в базу: округления одного лишь итога поездки мало.
  assert.equal(normalizeDriverPerson({ fullName: "И", reportCost: 1500.004 }).reportCost, 1500)
  assert.equal(normalizeDriverPerson({ fullName: "И", reportCost: 1500.005 }).reportCost, 1500.01)
  assert.equal(normalizeDriverPerson({ fullName: "И", reportCost: "0.30000000000000004" }).reportCost, 0.3)
})

test("normalizeDriverPerson: отрицательная цена → null", () => {
  // Отрицательная стоимость доставки бессмысленна: это отсутствие цены, а не скидка.
  assert.equal(normalizeDriverPerson({ fullName: "И", reportCost: -1 }).reportCost, null)
  assert.equal(normalizeDriverPerson({ fullName: "И", reportCost: "-1500" }).reportCost, null)
  assert.equal(normalizeDriverPerson({ fullName: "И", reportCost: -0.004 }).reportCost, null)
})

test("normalizeDriverPerson: адрес тримится, пустой и нестрока → null", () => {
  assert.equal(normalizeDriverPerson({ fullName: "И", addressTo: "  Ленина 1 " }).addressTo, "Ленина 1")
  assert.equal(normalizeDriverPerson({ fullName: "И", addressTo: "   " }).addressTo, null)
  assert.equal(normalizeDriverPerson({ fullName: "И", addressTo: null }).addressTo, null)
  assert.equal(normalizeDriverPerson({ fullName: "И" }).addressTo, null)
  assert.equal(normalizeDriverPerson({ fullName: "И", addressTo: 42 }).addressTo, null)
})

test("normalizeDriverPerson: остальные поля пассажира сохраняются как есть", () => {
  const person = {
    personId: "p1",
    fullName: "Иванов Иван",
    phone: "+79990000000",
    personType: "PASSENGER",
    personCategory: "CHILD",
    airlinePersonalId: "64f000000000000000000000"
  }
  const out = normalizeDriverPerson(person)
  assert.deepEqual(out, {
    ...person,
    baggageTags: [],
    reportCost: null,
    addressTo: null
  })
})

test("normalizeDriverPerson: исходный пассажир не мутируется", () => {
  const person = { fullName: "Иванов", baggageTags: null, reportCost: "abc", addressTo: "  " }
  normalizeDriverPerson(person)
  assert.equal(person.baggageTags, null)
  assert.equal(person.reportCost, "abc")
  assert.equal(person.addressTo, "  ")
})

test("normalizeDriversForWrite: чинит всех пассажиров каждого водителя, а не только первого", () => {
  const out = normalizeDriversForWrite([
    {
      fullName: "Первый",
      people: [
        { fullName: "П1", baggageTags: ["FV1"] },
        { fullName: "П2", baggageTags: null },
        { fullName: "П3" }
      ]
    },
    { fullName: "Второй", people: [{ fullName: "П4", baggageTags: null }] }
  ])
  assert.deepEqual(
    out.map((d) => d.people.map((p) => p.baggageTags)),
    [[["FV1"], [], []], [[]]]
  )
})

test("normalizeDriversForWrite: водитель без people → пустой список", () => {
  const [out] = normalizeDriversForWrite([{ fullName: "Иванов" }])
  assert.deepEqual(out.people, [])
  assert.ok("people" in out)
})

test("normalizeDriversForWrite: водитель с people: null → пустой список", () => {
  const [out] = normalizeDriversForWrite([{ fullName: "Иванов", people: null }])
  assert.deepEqual(out.people, [])
})

test("normalizeDriversForWrite: не массив на входе → пустой массив", () => {
  assert.deepEqual(normalizeDriversForWrite(undefined), [])
  assert.deepEqual(normalizeDriversForWrite(null), [])
  assert.deepEqual(normalizeDriversForWrite({ 0: "х" }), [])
})

test("normalizeDriversForWrite: остальные поля водителя не теряются и не правятся", () => {
  const driver = {
    id: "d1",
    fullName: "Иванов",
    phone: "+79990000000",
    linkPWA: "https://pwa/x",
    pickupAt: new Date("2026-06-24T06:00:00.000Z"),
    vehicleType: "Газель",
    deliveryCompletedAt: null,
    people: []
  }
  const [out] = normalizeDriversForWrite([driver])
  assert.deepEqual(out, driver)
})

test("normalizeDriversForWrite: исходные водители и пассажиры не мутируются", () => {
  const person = { fullName: "Пассажир", baggageTags: null, reportCost: "abc", addressTo: " " }
  const driver = { fullName: "Иванов", people: [person] }
  const drivers = [driver]
  const out = normalizeDriversForWrite(drivers)

  assert.equal(drivers[0], driver)
  assert.equal(driver.people[0], person)
  assert.equal(person.baggageTags, null)
  assert.equal(person.reportCost, "abc")
  assert.equal(person.addressTo, " ")
  assert.notEqual(out[0], driver)
  assert.notEqual(out[0].people[0], person)
})

test("sumPeopleCost: складывает цены пассажиров", () => {
  assert.equal(sumPeopleCost([{ reportCost: 1500 }, { reportCost: 500 }]), 2000)
})

test("sumPeopleCost: пустой список и не массив → 0", () => {
  assert.equal(sumPeopleCost([]), 0)
  assert.equal(sumPeopleCost(undefined), 0)
  assert.equal(sumPeopleCost(null), 0)
  assert.equal(sumPeopleCost({ 0: { reportCost: 100 } }), 0)
})

test("sumPeopleCost: пассажиры без цены игнорируются", () => {
  assert.equal(
    sumPeopleCost([{ reportCost: null }, { fullName: "Без цены" }, { reportCost: 700 }]),
    700
  )
  assert.equal(sumPeopleCost([{ reportCost: null }, { reportCost: null }]), 0)
})

test("sumPeopleCost: ноль участвует в сумме и не ломает её", () => {
  assert.equal(sumPeopleCost([{ reportCost: 0 }]), 0)
  assert.equal(sumPeopleCost([{ reportCost: 0 }, { reportCost: 1200 }]), 1200)
})

test("sumPeopleCost: результат округляется до копеек", () => {
  // 0.1 + 0.2 в double даёт 0.30000000000000004 — в сумму поездки такой хвост уходить не должен.
  assert.equal(sumPeopleCost([{ reportCost: 0.1 }, { reportCost: 0.2 }]), 0.3)
  assert.equal(sumPeopleCost([{ reportCost: 1500.005 }, { reportCost: 0.004 }]), 1500.01)
})

test("sumPeopleCost: отрицательная цена не уменьшает сумму поездки", () => {
  assert.equal(sumPeopleCost([{ reportCost: 1500 }, { reportCost: -500 }]), 1500)
})

test("tripReportCost: пассажиров нет → null, а не 0", () => {
  // Пустой список и «список» не-массив: считать не из чего, суммы у поездки нет.
  assert.equal(tripReportCost([]), null)
  assert.equal(tripReportCost(undefined), null)
  assert.equal(tripReportCost(null), null)
})

test("tripReportCost: пассажиры есть, цены не проставлены → 0", () => {
  // Это НЕ то же самое, что null: пассажиры заведены, просто цены пока нулевые.
  assert.equal(tripReportCost([{ reportCost: null }, { fullName: "Без цены" }]), 0)
})

test("tripReportCost: ноль участвует в сумме, сумма отдаётся числом", () => {
  assert.equal(tripReportCost([{ reportCost: 0 }]), 0)
  assert.equal(tripReportCost([{ reportCost: 0 }, { reportCost: 1200 }]), 1200)
  assert.equal(tripReportCost([{ reportCost: 1500 }, { reportCost: 500 }]), 2000)
})
