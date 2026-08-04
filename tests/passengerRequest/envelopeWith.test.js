import test from "node:test"
import assert from "node:assert/strict"
import { prisma } from "../../prisma.js"
import { withPassengerRequest } from "../../services/passengerRequest/envelope.js"
import { installPrismaDouble } from "../helpers/prismaDouble.js"

// Правило видимости заявок ФАП (services/passengerRequest/fapScope.js) работает
// по белому списку типов субъекта, а конверт проверяет его на каждой мутации.
// Тесты сантехники конверта авторизацию не проверяют, поэтому им нужен субъект,
// правилом не ограниченный, — диспетчер. С болванкой без subjectType они падали
// бы при включённом FAP_SCOPE_ENFORCE.
const DISPATCHER = {
  subjectType: "USER",
  subject: { id: "u", name: "Диспетчер Тестовый", role: "SUPERADMIN" },
  user: { id: "u", name: "Диспетчер Тестовый", role: "SUPERADMIN" }
}

function makeChannels() {
  const calls = []
  return {
    calls,
    channels: {
      logAction: async (payload) => calls.push({ kind: "log", payload }),
      publish: (payload) => calls.push({ kind: "publish", payload }),
      notifySite: async (payload) => calls.push({ kind: "notify", payload })
    }
  }
}

test("загружает заявку, применяет apply, пишет data и зовёт хвост", async () => {
  const double = installPrismaDouble({
    documents: { passengerRequest: { id: "r1", airlineId: "a1", status: "CREATED" } }
  })
  const { calls, channels } = makeChannels()
  try {
    const result = await withPassengerRequest({
      requestId: "r1",
      context: DISPATCHER,
      apply: (existing) => ({
        data: { status: "DONE" },
        log: {
          action: "act",
          description: "d",
          fulldescription: "f",
          airlineId: existing.airlineId,
          passengerRequestId: existing.id
        }
      }),
      channels
    })

    assert.equal(result.status, "DONE")
    assert.deepEqual(double.callsTo("passengerRequest", "update")[0].args, {
      where: { id: "r1" },
      data: { status: "DONE" }
    })
    assert.deepEqual(calls.map((c) => c.kind), ["log", "publish"])
    assert.equal(calls[1].payload.status, "DONE", "публикуется результат записи")
  } finally {
    double.restore()
  }
})

test("apply получает загруженную заявку", async () => {
  const double = installPrismaDouble({
    documents: { passengerRequest: { id: "r1", flightNumber: "TEST001" } }
  })
  const { channels } = makeChannels()
  let seen = null
  try {
    await withPassengerRequest({
      requestId: "r1",
      context: DISPATCHER,
      apply: (existing) => {
        seen = existing
        return { data: {}, log: { action: "a", description: "d", fulldescription: "f" } }
      },
      channels
    })
    assert.equal(seen.flightNumber, "TEST001")
  } finally {
    double.restore()
  }
})

test("сигнал «изменений нет» возвращает заявку без записи, лога и публикации", async () => {
  // Нужен для updatePassengerRequestDriver и updatePassengerRequestBaggageDriver:
  // при пустом патче они возвращают заявку нетронутой и молчат.
  const double = installPrismaDouble({
    documents: { passengerRequest: { id: "r1", flightNumber: "TEST001" } }
  })
  const { calls, channels } = makeChannels()
  try {
    const result = await withPassengerRequest({
      requestId: "r1",
      context: DISPATCHER,
      apply: () => null,
      channels
    })
    assert.equal(result.flightNumber, "TEST001")
    assert.equal(double.callsTo("passengerRequest", "update").length, 0)
    assert.deepEqual(calls, [])
  } finally {
    double.restore()
  }
})

test("apply может попросить уведомление и порядок хвоста", async () => {
  const double = installPrismaDouble({
    documents: { passengerRequest: { id: "r1", airlineId: "a1" } }
  })
  const { calls, channels } = makeChannels()
  try {
    await withPassengerRequest({
      requestId: "r1",
      context: DISPATCHER,
      apply: () => ({
        data: { status: "X" },
        log: { action: "a", description: "d", fulldescription: "f" },
        notify: { action: "a", passengerRequestId: "r1", airlineId: "a1", descriptionHtml: "h", __typename: "T" },
        notifyBeforePublish: true
      }),
      channels
    })
    assert.deepEqual(calls.map((c) => c.kind), ["log", "notify", "publish"])
  } finally {
    double.restore()
  }
})

test("несуществующая заявка отбивается до apply", async () => {
  const double = installPrismaDouble({ documents: {} })
  let applyCalled = false
  try {
    await assert.rejects(() =>
      withPassengerRequest({
        requestId: "нет-такой",
        context: DISPATCHER,
        apply: () => {
          applyCalled = true
          return { data: {}, log: { action: "a", description: "d", fulldescription: "f" } }
        },
        channels: makeChannels().channels
      })
    )
    assert.equal(applyCalled, false)
  } finally {
    double.restore()
  }
})

test("log можно вернуть функцией от результата записи", async () => {
  // Нужно ровно updatePassengerRequest: только она меняет airlineId, поэтому
  // значение обязано браться из записанного документа, а не из существующего.
  const double = installPrismaDouble({
    documents: { passengerRequest: { id: "r1", airlineId: "СТАРАЯ" } }
  })
  const { calls, channels } = makeChannels()
  try {
    await withPassengerRequest({
      requestId: "r1",
      context: DISPATCHER,
      apply: () => ({
        data: { airlineId: "НОВАЯ" },
        log: (passengerRequest) => ({
          action: "a",
          description: "d",
          fulldescription: "f",
          airlineId: passengerRequest.airlineId,
          passengerRequestId: passengerRequest.id
        })
      }),
      channels
    })
    assert.equal(calls[0].payload.airlineId, "НОВАЯ")
  } finally {
    double.restore()
  }
})

test("apply может быть асинхронным", async () => {
  const double = installPrismaDouble({
    documents: { passengerRequest: { id: "r1" } }
  })
  const { channels } = makeChannels()
  try {
    const result = await withPassengerRequest({
      requestId: "r1",
      context: DISPATCHER,
      apply: async () => ({
        data: { status: "ИЗ АСИНХРОННОГО" },
        log: { action: "a", description: "d", fulldescription: "f" }
      }),
      channels
    })
    assert.equal(result.status, "ИЗ АСИНХРОННОГО")
  } finally {
    double.restore()
  }
})
