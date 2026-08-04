import test, { after } from "node:test"
import assert from "node:assert/strict"
import { GraphQLError } from "graphql"
import {
  assertFapSubject,
  withFapAuthGuard
} from "../../services/passengerRequest/fapAccess.js"

// Импорт настоящего резолвера в smoke-тесте ниже тянет services/infra/pubsub.js,
// который при заданном REDIS_URL открывает два клиента Redis прямо на
// вычислении модуля и держит процесс — без этого хука раннер не завершается.
// При пустом REDIS_URL вызов ничего не делает.
after(async () => {
  const { disconnectPubSubRedis } = await import("../../services/infra/pubsub.js")
  await disconnectPubSubRedis()
})

const userContext = () => ({ subjectType: "USER", subject: { id: "u1" } })

test("assertFapSubject пропускает аутентифицированного пользователя", () => {
  assert.doesNotThrow(() => assertFapSubject(userContext()))
})

test("assertFapSubject отбивает пустой контекст", () => {
  assert.throws(() => assertFapSubject({}), /Unauthorized/)
  assert.throws(() => assertFapSubject({ subject: null }), /Unauthorized/)
  assert.throws(() => assertFapSubject(null), /Unauthorized/)
})

test("бросается именно GraphQLError с кодом UNAUTHENTICATED и статусом 401", () => {
  try {
    assertFapSubject({})
    assert.fail("должно было бросить")
  } catch (error) {
    // Тип важен: обычный Error с тем же extensions Apollo превратит в
    // INTERNAL_SERVER_ERROR со статусом 500, и клиентский authErrorLink
    // перестанет распознавать это как отказ авторизации.
    assert.ok(error instanceof GraphQLError)
    assert.equal(error.extensions.code, "UNAUTHENTICATED")
    assert.equal(error.extensions.http.status, 401)
  }
})

test("внешний пользователь проходит: subject есть, роль не требуется", () => {
  assert.doesNotThrow(() =>
    assertFapSubject({
      subjectType: "EXTERNAL_USER",
      subject: { id: "ext1", scope: "HOTEL", hotelId: "h1" }
    })
  )
})

test("водитель и сотрудник авиакомпании проходят", () => {
  assert.doesNotThrow(() =>
    assertFapSubject({ subjectType: "DRIVER", subject: { id: "d1" } })
  )
  assert.doesNotThrow(() =>
    assertFapSubject({ subjectType: "AIRLINE_PERSONAL", subject: { id: "p1" } })
  )
})

test("публичный превью-субъект гостиницы НЕ проходит", () => {
  // authorizeHotelPreview меняет ссылку-превью на JWT без аутентификации,
  // поэтому непустой subject здесь не означает права трогать заявки.
  // Отказ именно FORBIDDEN: токен валиден, восстанавливать нечего.
  try {
    assertFapSubject({
      subjectType: "HOTEL_PREVIEW",
      subject: { hotelId: "h1", previewTokenHash: "abc" }
    })
    assert.fail("должно было бросить")
  } catch (error) {
    assert.ok(error instanceof GraphQLError)
    assert.equal(error.extensions.code, "FORBIDDEN")
    assert.equal(error.extensions.http.status, 403)
  }
})

test("неизвестный тип субъекта не проходит", () => {
  assert.throws(
    () => assertFapSubject({ subjectType: "SOMETHING_NEW", subject: { id: "x" } }),
    /Forbidden/
  )
  assert.throws(() => assertFapSubject({ subject: { id: "x" } }), /Forbidden/)
})

test("обёртка защищает Query и Mutation и сохраняет набор ключей", () => {
  const source = {
    PassengerRequest: { airline: () => "поле не трогаем" },
    Query: { passengerRequest: async () => "ok" },
    Mutation: { createPassengerRequest: async () => "ok" },
    Subscription: { passengerRequestUpdated: { subscribe: () => "iterator" } }
  }
  const guarded = withFapAuthGuard(source)

  assert.deepEqual(Object.keys(guarded).sort(), Object.keys(source).sort())
  assert.deepEqual(Object.keys(guarded.Mutation), Object.keys(source.Mutation))
  assert.equal(guarded.PassengerRequest.airline(), "поле не трогаем")
})

test("обёрнутая мутация отбивает пустой контекст и пропускает наполненный", async () => {
  const guarded = withFapAuthGuard({
    Mutation: { doThing: async (_p, args) => `сделано ${args.id}` }
  })

  await assert.rejects(
    () => guarded.Mutation.doThing(null, { id: "1" }, {}),
    /Unauthorized/
  )
  assert.equal(
    await guarded.Mutation.doThing(null, { id: "1" }, userContext()),
    "сделано 1"
  )
})

test("обёртка не глотает отказ самого резолвера", async () => {
  const guarded = withFapAuthGuard({
    Mutation: {
      doThing: async () => {
        throw new GraphQLError("Мест нет")
      }
    }
  })
  await assert.rejects(
    () => guarded.Mutation.doThing(null, {}, userContext()),
    /Мест нет/
  )
})

test("подписка отбивает пустой контекст до создания итератора", () => {
  let subscribeCalled = false
  const guarded = withFapAuthGuard({
    Subscription: {
      thing: {
        subscribe: () => {
          subscribeCalled = true
          return "iterator"
        }
      }
    }
  })

  assert.throws(() => guarded.Subscription.thing.subscribe(null, {}, {}), /Unauthorized/)
  assert.equal(subscribeCalled, false)
  assert.equal(
    guarded.Subscription.thing.subscribe(null, {}, userContext()),
    "iterator"
  )
})

test("у подписки сохраняются соседние поля, а не только subscribe", () => {
  const guarded = withFapAuthGuard({
    Subscription: {
      thing: {
        subscribe: () => "iterator",
        resolve: (payload) => payload
      }
    }
  })
  assert.equal(typeof guarded.Subscription.thing.resolve, "function")
  assert.equal(guarded.Subscription.thing.resolve("x"), "x")
})

test("неожиданная форма поля отвергается на сборке, а не пропускается молча", () => {
  assert.throws(
    () => withFapAuthGuard({ Mutation: { doThing: { resolve: async () => "ok" } } }),
    /ожидалась функция-резолвер/
  )
  assert.throws(
    () => withFapAuthGuard({ Subscription: { thing: { notSubscribe: () => {} } } }),
    /ожидался объект с функцией subscribe/
  )
})

test("аргументы резолвера пробрасываются без искажения", async () => {
  const seen = []
  const guarded = withFapAuthGuard({
    Mutation: {
      doThing: async (parent, args, context, info) => {
        seen.push([parent, args, context, info])
        return "ok"
      }
    }
  })
  const context = userContext()
  await guarded.Mutation.doThing("P", { a: 1 }, context, "INFO")
  assert.deepEqual(seen[0], ["P", { a: 1 }, context, "INFO"])
})

test("реальный резолвер ФАП защищён целиком", async () => {
  // Обёртка проверялась на фикстурах; здесь она встречается с настоящим
  // модулем. Тест ловит два класса регрессий: поле, объявленное в форме,
  // которую обёртка не умеет защищать, и корневое поле, добавленное мимо
  // Query/Mutation.
  const resolvers = (
    await import("../../resolvers/passengerRequest/passengerRequest.resolver.js")
  ).default

  // Числа обновляются осознанно: если поле добавлено или снято намеренно,
  // поправь их здесь. Падение «56 !== 55» означает новое корневое поле,
  // которое нужно осмотреть, а не механически подогнать.
  assert.equal(Object.keys(resolvers.Query).length, 2)
  assert.equal(Object.keys(resolvers.Mutation).length, 55)
  assert.equal(Object.keys(resolvers.Subscription).length, 2)

  for (const [name, fn] of Object.entries(resolvers.Query)) {
    await assert.rejects(() => fn(null, {}, {}), /Unauthorized/, `Query.${name}`)
  }
  for (const [name, fn] of Object.entries(resolvers.Mutation)) {
    await assert.rejects(() => fn(null, {}, {}), /Unauthorized/, `Mutation.${name}`)
  }
  for (const [name, def] of Object.entries(resolvers.Subscription)) {
    assert.throws(
      () => def.subscribe(null, {}, {}),
      /Unauthorized/,
      `Subscription.${name}`
    )
  }
})
