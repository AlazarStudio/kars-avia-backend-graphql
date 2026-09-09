// Серверный сторож правки АРХИВНОЙ заявки эскадрильи (requestArchiveGuard).
//
// До сих пор архивную заявку мог править любой модератор: единственный гейт на
// updateRequest — moderatorMiddleware, то есть роль, а не право. Тест
// сформулирован отрицанием, как fapEditGuard.test: спрашиваем «не пускает ли
// сторож лишнего», а не «пускает ли своих» — перечень «своё можно» на сломанном
// коде не упал бы.
//
// Правила домена отличаются от ФАП, и отличия закреплены отдельными тестами:
// "archiving" и "canceled" НЕ запираются, а ключ — requestUpdateCompleted.

import test from "node:test"
import assert from "node:assert/strict"
import { GraphQLError } from "graphql"
import {
  assertRequestNotArchived,
  assertRequestNotArchivedById,
  isRequestArchived,
  requestArchiveVerdict
} from "../../services/request/requestArchiveGuard.js"
import { installPrismaDouble } from "../helpers/prismaDouble.js"

const userContext = (over = {}) => ({
  subjectType: "USER",
  user: { id: "user-1", name: "Модератор", role: "DISPATCHERMODERATOR", ...over }
})

const expectForbidden = async (promise) => {
  await assert.rejects(promise, (error) => {
    assert.ok(error instanceof GraphQLError)
    assert.equal(error.extensions.code, "FORBIDDEN")
    assert.equal(error.extensions.http.status, 403)
    return true
  })
}

const moderator = { id: "user-1", role: "DISPATCHERMODERATOR", accessMenu: null }

// ── Чистый вердикт (без базы) ──

test("вердикт: archived без ключа — needs-permission", () => {
  assert.equal(
    requestArchiveVerdict({
      status: "archived",
      archive: true,
      role: "DISPATCHERMODERATOR",
      hasCompletedKey: false
    }),
    "needs-permission"
  )
})

test("вердикт: архивность двухсигнальная — archive:true запирает при живом статусе", () => {
  // Крон пишет обе метки сразу, но старые записи и ручные правки в базе могут
  // нести только одну. Любого одного сигнала достаточно.
  assert.equal(
    requestArchiveVerdict({
      status: "done",
      archive: true,
      role: "DISPATCHERMODERATOR",
      hasCompletedKey: false
    }),
    "needs-permission"
  )
})

test("вердикт: архивность двухсигнальная — status:archived запирает при archive:false", () => {
  assert.equal(
    requestArchiveVerdict({
      status: "archived",
      archive: false,
      role: "DISPATCHERMODERATOR",
      hasCompletedKey: false
    }),
    "needs-permission"
  )
})

test("вердикт: archiving НЕ запирается — 69-дневный карантин правится свободно", () => {
  // Отличие от ФАП: между вылетом и уходом в архив заявка живая.
  for (const archive of [false, undefined]) {
    assert.equal(
      requestArchiveVerdict({
        status: "archiving",
        archive,
        role: "DISPATCHERMODERATOR",
        hasCompletedKey: false
      }),
      "ok"
    )
  }
})

test("вердикт: canceled НЕ запирается — ветки cancelled из ФАП здесь нет", () => {
  // Одна l в слове — это не опечатка, так пишет cancelRequest.
  assert.equal(
    requestArchiveVerdict({
      status: "canceled",
      archive: false,
      role: "DISPATCHERMODERATOR",
      hasCompletedKey: false
    }),
    "ok"
  )
})

test("вердикт: живые статусы не запираются", () => {
  for (const status of [
    "created",
    "opened",
    "done",
    "transferred",
    undefined,
    null
  ]) {
    assert.equal(
      requestArchiveVerdict({
        status,
        archive: false,
        role: "DISPATCHERMODERATOR",
        hasCompletedKey: false
      }),
      "ok"
    )
  }
})

test("вердикт: SUPERADMIN проходит мимо ключа", () => {
  assert.equal(
    requestArchiveVerdict({
      status: "archived",
      archive: true,
      role: "SUPERADMIN",
      hasCompletedKey: false
    }),
    "ok"
  )
})

test("вердикт: ключ открывает архивную", () => {
  assert.equal(
    requestArchiveVerdict({
      status: "archived",
      archive: true,
      role: "DISPATCHERMODERATOR",
      hasCompletedKey: true
    }),
    "ok"
  )
})

test("вердикт: status — свободная строка, регистр и пробелы не снимают замок", () => {
  for (const status of ["Archived", " archived ", "ARCHIVED"]) {
    assert.equal(isRequestArchived({ status, archive: false }), true)
  }
})

test("вердикт: пустой аргумент не роняет сторож", () => {
  assert.equal(isRequestArchived({}), false)
  assert.equal(isRequestArchived(undefined), false)
})

// ── Полный сторож ──

test("сторож: архивную НЕ правит модератор без права", async () => {
  const double = installPrismaDouble({ documents: { user: moderator } })
  try {
    await expectForbidden(
      assertRequestNotArchived(userContext(), {
        status: "archived",
        archive: true
      })
    )
  } finally {
    double.restore()
  }
})

test("сторож: право requestUpdateCompleted открывает архивную", async () => {
  const double = installPrismaDouble({
    documents: {
      user: { ...moderator, accessMenu: { requestUpdateCompleted: true } }
    }
  })
  try {
    await assertRequestNotArchived(userContext(), {
      status: "archived",
      archive: true
    })
  } finally {
    double.restore()
  }
})

test("сторож: право берётся из БАЗЫ, а не из контекста — контекстный accessMenu не обманет", async () => {
  // authContext не кладёт accessMenu в context.user; если бы сторож верил
  // контексту, подделанный объект открыл бы архивную заявку.
  const double = installPrismaDouble({ documents: { user: moderator } })
  try {
    await expectForbidden(
      assertRequestNotArchived(
        userContext({ accessMenu: { requestUpdateCompleted: true } }),
        { status: "archived", archive: true }
      )
    )
  } finally {
    double.restore()
  }
})

test("сторож: право, выданное ДОЛЖНОСТЬЮ, работает — перечитывание из базы не декоративное", async () => {
  const double = installPrismaDouble({
    documents: {
      user: { ...moderator, positionId: "position-1" },
      position: { accessMenu: { requestUpdateCompleted: true } }
    }
  })
  try {
    await assertRequestNotArchived(userContext(), {
      status: "archived",
      archive: true
    })
  } finally {
    double.restore()
  }
})

test("сторож: reserveUpdateCompleted НЕ открывает заявку эскадрильи", async () => {
  // Право соседнего домена (ФАП). Путаница ключей — самый вероятный регресс.
  const double = installPrismaDouble({
    documents: {
      user: { ...moderator, accessMenu: { reserveUpdateCompleted: true } }
    }
  })
  try {
    await expectForbidden(
      assertRequestNotArchived(userContext(), {
        status: "archived",
        archive: true
      })
    )
  } finally {
    double.restore()
  }
})

test("сторож: неархивную правит кто угодно из своих — базу не трогаем", async () => {
  const double = installPrismaDouble({ documents: { user: moderator } })
  try {
    await assertRequestNotArchived(userContext(), {
      status: "archiving",
      archive: false
    })
    assert.equal(double.callsTo("user").length, 0)
  } finally {
    double.restore()
  }
})

test("сторож: SUPERADMIN проходит по быстрому пути, без запроса к базе", async () => {
  const double = installPrismaDouble({ documents: { user: moderator } })
  try {
    await assertRequestNotArchived(userContext({ role: "SUPERADMIN" }), {
      status: "archived",
      archive: true
    })
    assert.equal(double.callsTo("user").length, 0)
  } finally {
    double.restore()
  }
})

test("сторож: внешний субъект архивную не правит — расхождение с ФАП намеренное", async () => {
  // В ФАП внешние субъекты продолжают цикл после COMPLETED (сдают отчёты).
  // Здесь после архива продолжать нечего, а у updateHotel ролевой middleware
  // закомментирован — сторож там единственная проверка.
  await expectForbidden(
    assertRequestNotArchived(
      { subjectType: "EXTERNAL_USER", externalUser: { id: "x1" } },
      { status: "archived", archive: true }
    )
  )
})

// ── Вариант по id (шахматка отеля) ──

test("сторож по id: архивную не пускает и читает заявку ровно одним запросом", async () => {
  const double = installPrismaDouble({
    documents: {
      user: moderator,
      request: { id: "req-1", status: "archived", archive: true }
    }
  })
  try {
    await expectForbidden(assertRequestNotArchivedById(userContext(), "req-1"))
    assert.equal(double.callsTo("request", "findUnique").length, 1)
  } finally {
    double.restore()
  }
})

test("сторож по id: заявки нет — не бросает, not found ловит резолвер", async () => {
  const double = installPrismaDouble({ documents: { user: moderator } })
  try {
    await assertRequestNotArchivedById(userContext(), "req-missing")
  } finally {
    double.restore()
  }
})

test("сторож по id: без requestId не бросает и в базу не ходит", async () => {
  const double = installPrismaDouble({ documents: { user: moderator } })
  try {
    await assertRequestNotArchivedById(userContext(), null)
    await assertRequestNotArchivedById(userContext(), undefined)
    assert.equal(double.callsTo("request").length, 0)
  } finally {
    double.restore()
  }
})
