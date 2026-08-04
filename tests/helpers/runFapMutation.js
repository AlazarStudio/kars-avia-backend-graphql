// Общий прогон мутации ФАП для характеризационных тестов: ставит двойник
// prisma и шпиона pubsub, выполняет мутацию и отдаёт срез следов — что
// записано в документ, что ушло в лог, что в сайтовые уведомления, что в
// подписку и в каком порядке всё это случилось.
//
// releasePubsubAfterTests() здесь НЕ вызывается намеренно: after() из
// node:test регистрируется в контексте того файла, который его выполняет,
// поэтому каждый тест-файл обязан вызвать его сам.

import resolvers from "../../resolvers/passengerRequest/passengerRequest.resolver.js"
import { installPrismaDouble } from "./prismaDouble.js"
import { normalizeSnapshot, installPubsubSpy } from "./fapHarness.js"
import {
  makeRequest,
  makeContext
} from "../passengerRequest/fixtures/passengerRequest.js"

export async function runFapMutation(
  name,
  args,
  { request = makeRequest(), context = makeContext() } = {}
) {
  const double = installPrismaDouble({ documents: { passengerRequest: request } })
  const spy = installPubsubSpy()
  try {
    const result = await resolvers.Mutation[name](null, args, context)
    return {
      result,
      written: double.callsTo("passengerRequest", "update").map((c) => normalizeSnapshot(c.args.data)),
      logged: double.callsTo("log", "create").map((c) => normalizeSnapshot(c.args.data)),
      notified: double.callsTo("notification", "create").map((c) => normalizeSnapshot(c.args.data)),
      published: spy.published.map((p) => p.topic),
      order: [
        ...double.calls.map((c) => ({ at: c.seq, event: `${c.model}.${c.method}` })),
        ...spy.published.map((p) => ({ at: p.seq, event: `publish:${p.topic}` }))
      ]
        .sort((a, b) => a.at - b.at)
        .map((e) => e.event)
    }
  } finally {
    spy.restore()
    double.restore()
  }
}
