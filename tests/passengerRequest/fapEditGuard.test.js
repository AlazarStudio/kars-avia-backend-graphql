// Серверный сторож правки завершённых заявок ФАП (fapEditGuard).
//
// Правило до сих пор жило только на фронте (fapEditAccess.js), и docs/FAP.md
// честно признавал: прямой мутацией завершённую заявку править можно. Тест
// сформулирован отрицанием, как fapScopeGuard.test: спрашиваем «не пускает ли
// сторож лишнего», а не «пускает ли своих» — перечень «своё можно» на
// сломанном коде не упал бы.

import test from "node:test"
import assert from "node:assert/strict"
import { GraphQLError } from "graphql"
import {
  assertRequestEditable,
  editLockVerdict
} from "../../services/passengerRequest/fapEditGuard.js"
import { installPrismaDouble } from "../helpers/prismaDouble.js"

const userContext = (over = {}) => ({
  subjectType: "USER",
  user: { id: "user-1", name: "Диспетчер", role: "DISPATCHERADMIN", ...over }
})

const expectForbidden = async (promise) => {
  await assert.rejects(promise, (error) => {
    assert.ok(error instanceof GraphQLError)
    assert.equal(error.extensions.code, "FORBIDDEN")
    assert.equal(error.extensions.http.status, 403)
    return true
  })
}

// ── Чистый вердикт (без базы) — зеркало фронтового fapEditAccess ──

test("вердикт: CANCELLED заперта всегда — право не помогает", () => {
  assert.equal(
    editLockVerdict({ status: "CANCELLED", role: "SUPERADMIN", hasCompletedKey: true }),
    "cancelled"
  )
})

test("вердикт: COMPLETED без ключа — needs-permission, с ключом — ok", () => {
  assert.equal(
    editLockVerdict({ status: "COMPLETED", role: "DISPATCHERADMIN", hasCompletedKey: false }),
    "needs-permission"
  )
  assert.equal(
    editLockVerdict({ status: "COMPLETED", role: "DISPATCHERADMIN", hasCompletedKey: true }),
    "ok"
  )
})

test("вердикт: SUPERADMIN проходит мимо ключа (как canAccessMenu)", () => {
  assert.equal(
    editLockVerdict({ status: "COMPLETED", role: "SUPERADMIN", hasCompletedKey: false }),
    "ok"
  )
})

test("вердикт: живые статусы не запираются", () => {
  for (const status of ["CREATED", "ACCEPTED", "IN_PROGRESS", undefined]) {
    assert.equal(
      editLockVerdict({ status, role: "DISPATCHERADMIN", hasCompletedKey: false }),
      "ok"
    )
  }
})

// ── Полный сторож ──

test("сторож: отменённую НЕ правит даже суперадмин", async () => {
  await expectForbidden(
    assertRequestEditable(userContext({ role: "SUPERADMIN" }), {
      status: "CANCELLED"
    })
  )
})

test("сторож: завершённую НЕ правит диспетчер без права", async () => {
  const double = installPrismaDouble({
    documents: {
      user: { id: "user-1", role: "DISPATCHERADMIN", accessMenu: null }
    }
  })
  try {
    await expectForbidden(
      assertRequestEditable(userContext(), { status: "COMPLETED" })
    )
  } finally {
    double.restore()
  }
})

test("сторож: право reserveUpdateCompleted открывает завершённую", async () => {
  const double = installPrismaDouble({
    documents: {
      user: {
        id: "user-1",
        role: "DISPATCHERADMIN",
        accessMenu: { reserveUpdateCompleted: true }
      }
    }
  })
  try {
    await assertRequestEditable(userContext(), { status: "COMPLETED" })
  } finally {
    double.restore()
  }
})

test("сторож: право берётся из БАЗЫ, а не из контекста — контекстный accessMenu не обманет", async () => {
  // authContext не кладёт accessMenu в context.user; если бы сторож верил
  // контексту, подделанный объект открыл бы завершённую заявку.
  const double = installPrismaDouble({
    documents: {
      user: { id: "user-1", role: "DISPATCHERADMIN", accessMenu: null }
    }
  })
  try {
    await expectForbidden(
      assertRequestEditable(
        userContext({ accessMenu: { reserveUpdateCompleted: true } }),
        { status: "COMPLETED" }
      )
    )
  } finally {
    double.restore()
  }
})

test("сторож: живую заявку правит кто угодно из своих — базу не трогаем", async () => {
  await assertRequestEditable(userContext(), { status: "IN_PROGRESS" })
})

test("сторож: внешних субъектов не трогает (их цикл живёт после завершения)", async () => {
  await assertRequestEditable(
    { subjectType: "EXTERNAL_USER", externalUser: { id: "x1" } },
    { status: "COMPLETED" }
  )
})
