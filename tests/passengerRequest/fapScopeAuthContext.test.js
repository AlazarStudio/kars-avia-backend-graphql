// Стык между аутентификацией и правилом видимости ФАП.
//
// resolveScope читает поля субъекта, а кладёт их туда buildAuthContext своим
// select. Тесты fapScope.test.js строят субъект руками и этот стык не
// покрывают — ровно поэтому поля принадлежности внешнего пользователя могли
// отсутствовать в select и остаться незамеченными до включения флага.
//
// ⚠️ Двойник prisma по умолчанию отдаёт документ целиком и select игнорирует —
// на нём дефект не воспроизводится. Поэтому здесь проекция эмулируется, как в
// настоящей Prisma: возвращаются только запрошенные ключи.

import test from "node:test"
import assert from "node:assert/strict"
import jwt from "jsonwebtoken"
import { installPrismaDouble } from "../helpers/prismaDouble.js"
import { buildAuthContext } from "../../middlewares/authContext.js"
import { resolveScope } from "../../services/passengerRequest/fapScope.js"

const SECRET = "fap-scope-auth-context-test-secret"
const SESSION_TOKEN = "session-token-1"

const project = (doc, select) => {
  if (!doc) return null
  if (!select) return { ...doc }
  return Object.fromEntries(
    Object.entries(select)
      .filter(([, wanted]) => wanted)
      .map(([key]) => [key, doc[key] ?? null])
  )
}

const externalUserDoc = (overrides) => ({
  id: "ext-1",
  email: "auto@auto.internal",
  name: "Внешний",
  scope: "HOTEL",
  accessType: "CRM",
  hotelId: null,
  driverId: null,
  airlineId: null,
  airportId: null,
  passengerRequestId: null,
  active: true,
  refreshToken: SESSION_TOKEN,
  sessionExpiresAt: new Date(Date.now() + 60 * 60 * 1000),
  ...overrides
})

// Контекст строится ровно так, как в бою: подписанный JWT → buildAuthContext.
async function contextFor(model, doc, tokenPayload) {
  const previousSecret = process.env.JWT_SECRET
  process.env.JWT_SECRET = SECRET

  const double = installPrismaDouble({
    overrides: { [model]: { findUnique: (args) => project(doc, args?.select) } }
  })

  try {
    const token = jwt.sign(
      { ...tokenPayload, sessionToken: SESSION_TOKEN },
      SECRET,
      { expiresIn: "1h" }
    )
    return await buildAuthContext(`Bearer ${token}`)
  } finally {
    double.restore()
    if (previousSecret === undefined) delete process.env.JWT_SECRET
    else process.env.JWT_SECRET = previousSecret
  }
}

const externalContext = (doc) =>
  contextFor("externalUser", doc, {
    subjectType: "EXTERNAL_USER",
    externalUserId: doc.id
  })

test("контекст внешнего водителя несёт заявку, а не отказ", async () => {
  const context = await externalContext(
    externalUserDoc({ scope: "DRIVER", passengerRequestId: "req-1" })
  )

  assert.equal(context.subject.passengerRequestId, "req-1")
  assert.deepEqual(resolveScope(context), { kind: "request", requestId: "req-1" })
})

test("контекст внешнего представителя несёт пару авиакомпания+аэропорт", async () => {
  const context = await externalContext(
    externalUserDoc({
      scope: "REPRESENTATIVE",
      airlineId: "air-1",
      airportId: "apt-1"
    })
  )

  assert.deepEqual(resolveScope(context), {
    kind: "airlineAirport",
    airlineId: "air-1",
    airportId: "apt-1"
  })
})

test("контекст внешней гостиницы несёт гостиницу", async () => {
  const context = await externalContext(
    externalUserDoc({ scope: "HOTEL", hotelId: "hotel-1" })
  )

  assert.deepEqual(resolveScope(context), { kind: "hotel", hotelId: "hotel-1" })
})

test("контекст персонала авиакомпании несёт airlineId", async () => {
  const context = await contextFor(
    "airlinePersonal",
    {
      id: "pers-1",
      refreshToken: SESSION_TOKEN,
      airlineId: "air-2",
      departmentId: null,
      role: null,
      positionId: null
    },
    { subjectType: "AIRLINE_PERSONAL", airlinePersonalId: "pers-1" }
  )

  assert.deepEqual(resolveScope(context), { kind: "airline", airlineId: "air-2" })
})

test("контекст пользователя несёт роль и принадлежность", async () => {
  const hotelUser = await contextFor(
    "user",
    { id: "u-1", role: "HOTELADMIN", hotelId: "hotel-9", refreshToken: SESSION_TOKEN },
    { subjectType: "USER", userId: "u-1" }
  )
  assert.deepEqual(resolveScope(hotelUser), { kind: "hotel", hotelId: "hotel-9" })

  const airlineUser = await contextFor(
    "user",
    { id: "u-2", role: "AIRLINEADMIN", airlineId: "air-9", refreshToken: SESSION_TOKEN },
    { subjectType: "USER", userId: "u-2" }
  )
  assert.deepEqual(resolveScope(airlineUser), { kind: "airline", airlineId: "air-9" })
})
