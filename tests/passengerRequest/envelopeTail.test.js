import test from "node:test"
import assert from "node:assert/strict"
import { finishPassengerRequestMutation } from "../../services/passengerRequest/envelope.js"

// Хелпер зовёт три внешних канала. Подменяем их инъекцией, чтобы проверить
// сам порядок и передачу аргументов, не поднимая ни prisma, ни pubsub.
function makeChannels() {
  const calls = []
  return {
    calls,
    channels: {
      logAction: async (payload) => {
        calls.push({ kind: "log", payload })
      },
      publish: (payload) => {
        calls.push({ kind: "publish", payload })
      },
      notifySite: async (payload) => {
        calls.push({ kind: "notify", payload })
      }
    }
  }
}

test("по умолчанию порядок: лог, публикация, уведомление", async () => {
  const { calls, channels } = makeChannels()
  await finishPassengerRequestMutation({
    context: { subject: { id: "u" } },
    oldData: { id: "r1" },
    newData: { id: "r1", status: "DONE" },
    log: { action: "act", description: "d", fulldescription: "f", airlineId: "a1", passengerRequestId: "r1" },
    notify: { action: "act", passengerRequestId: "r1", airlineId: "a1", descriptionHtml: "x", __typename: "T" },
    channels
  })
  assert.deepEqual(calls.map((c) => c.kind), ["log", "publish", "notify"])
})

test("notifyBeforePublish меняет порядок хвоста", async () => {
  const { calls, channels } = makeChannels()
  await finishPassengerRequestMutation({
    context: {},
    oldData: { id: "r1" },
    newData: { id: "r1" },
    log: { action: "act", description: "d", fulldescription: "f", airlineId: "a1", passengerRequestId: "r1" },
    notify: { action: "act", passengerRequestId: "r1", airlineId: "a1", descriptionHtml: "x", __typename: "T" },
    notifyBeforePublish: true,
    channels
  })
  assert.deepEqual(calls.map((c) => c.kind), ["log", "notify", "publish"])
})

test("сбой уведомления не роняет хвост и не съедает публикацию", async () => {
  // Дефект №20 реестра. Уведомление — побочный канал, как история и письмо, но
  // единственный незащищённый: notifyPassengerRequestSite делает два обращения
  // в базу. Его бросок ронял мутацию по УЖЕ ЗАПИСАННОЙ заявке, а при
  // notifyBeforePublish отменял ещё и публикацию — подписчики не узнавали об
  // изменении никогда, потому что повторное сохранение отсекает patchIsNoop.
  // Проверяем ОБА порядка: в опасном публикация обязана состояться.
  for (const notifyBeforePublish of [false, true]) {
    const { calls, channels } = makeChannels()
    channels.notifySite = async () => {
      calls.push({ kind: "notify-throw" })
      throw new Error("база уведомлений недоступна")
    }

    await finishPassengerRequestMutation({
      context: {},
      oldData: { id: "r1" },
      newData: { id: "r1" },
      log: { action: "act", description: "d", fulldescription: "f", airlineId: "a1", passengerRequestId: "r1" },
      notify: { action: "act", passengerRequestId: "r1", airlineId: "a1", descriptionHtml: "x", __typename: "T" },
      notifyBeforePublish,
      channels
    })

    assert.ok(
      calls.some((c) => c.kind === "publish"),
      `публикация состоялась при notifyBeforePublish=${notifyBeforePublish}`
    )
    assert.ok(
      calls.some((c) => c.kind === "log"),
      `история записана при notifyBeforePublish=${notifyBeforePublish}`
    )
  }
})

test("успешное уведомление по-прежнему доходит", async () => {
  // Обратная проверка к №20: try/catch глушит только отказ, рабочий путь цел.
  const { calls, channels } = makeChannels()
  await finishPassengerRequestMutation({
    context: {},
    oldData: { id: "r1" },
    newData: { id: "r1" },
    log: { action: "act", description: "d", fulldescription: "f", airlineId: "a1", passengerRequestId: "r1" },
    notify: { action: "act", passengerRequestId: "r1", airlineId: "a1", descriptionHtml: "x", __typename: "T" },
    channels
  })
  assert.deepEqual(calls.map((c) => c.kind), ["log", "publish", "notify"])
})

test("без notify уведомления нет вовсе", async () => {
  const { calls, channels } = makeChannels()
  await finishPassengerRequestMutation({
    context: {},
    oldData: { id: "r1" },
    newData: { id: "r1" },
    log: { action: "act", description: "d", fulldescription: "f", airlineId: "a1", passengerRequestId: "r1" },
    channels
  })
  assert.deepEqual(calls.map((c) => c.kind), ["log", "publish"])
})

test("в лог уходит context, oldData и newData плюс поля log без изменений", async () => {
  const { calls, channels } = makeChannels()
  const context = { subject: { id: "u" } }
  const oldData = { id: "r1", status: "CREATED" }
  const newData = { id: "r1", status: "DONE" }
  await finishPassengerRequestMutation({
    context,
    oldData,
    newData,
    log: {
      action: "act",
      description: "d",
      fulldescription: "f",
      reason: "почему",
      airlineId: "a1",
      passengerRequestId: "r1",
      emailAction: "custom_action",
      emailExtras: { hotelName: "Азия" },
      cancelReason: "отмена",
      skipEmail: true
    },
    channels
  })
  const payload = calls[0].payload
  assert.equal(payload.context, context)
  assert.equal(payload.oldData, oldData)
  assert.equal(payload.newData, newData)
  assert.equal(payload.action, "act")
  assert.equal(payload.reason, "почему")
  assert.equal(payload.airlineId, "a1")
  assert.equal(payload.passengerRequestId, "r1")
  assert.equal(payload.emailAction, "custom_action")
  assert.deepEqual(payload.emailExtras, { hotelName: "Азия" })
  assert.equal(payload.cancelReason, "отмена")
  assert.equal(payload.skipEmail, true)
})

test("публикуется именно newData", async () => {
  const { calls, channels } = makeChannels()
  const newData = { id: "r1", marker: "это должно уйти в подписку" }
  await finishPassengerRequestMutation({
    context: {},
    oldData: { id: "r1" },
    newData,
    log: { action: "act", description: "d", fulldescription: "f", airlineId: "a1", passengerRequestId: "r1" },
    channels
  })
  assert.equal(calls[1].payload, newData)
})

test("необязательные поля log не подставляются сами", async () => {
  // Хелпер обязан быть механическим переносчиком: если мутация не передала
  // emailAction, в logPassengerRequestAction он и не должен появиться.
  const { calls, channels } = makeChannels()
  await finishPassengerRequestMutation({
    context: {},
    oldData: { id: "r1" },
    newData: { id: "r1" },
    log: { action: "act", description: "d", fulldescription: "f", airlineId: "a1", passengerRequestId: "r1" },
    channels
  })
  const payload = calls[0].payload
  assert.equal("emailAction" in payload, false)
  assert.equal("emailExtras" in payload, false)
  assert.equal("cancelReason" in payload, false)
  assert.equal("skipEmail" in payload, false)
})
