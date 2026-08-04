// Двойник prisma для характеризационных тестов ФАП.
//
// mock.module в Node 20 недоступен — на нём падают два средовых теста
// репозитория, поэтому подменяем модели прямо на синглтоне. Проверено: у
// инстанса PrismaClient 71 модель-свойство, все writable, $transaction тоже;
// импорт prisma.js соединения с базой не открывает.
//
// Двойник накрывает ВСЕ модели, а не только ожидаемые: побочные каналы ФАП
// (logAction пишет через prisma.log.create, сборка получателей письма читает
// prisma.user / prisma.dispatcherDepartment / prisma.airlineDepartment) обязаны
// упереться в заглушку, а не в живую базу. Письма при этом физически не уходят
// и без нас: sendEmail пропускает отправку, если EMAIL_ENABLED !== "true".
//
// ОБЯЗАТЕЛЬНО вызывать restore() в finally: иначе следующий тест-файл в том же
// процессе получит чужой стенд.

import { prisma } from "../../prisma.js"
import { nextSeq } from "./seq.js"

const READ_ONE = ["findUnique", "findUniqueOrThrow", "findFirst", "findFirstOrThrow"]
const READ_MANY = ["findMany"]
const WRITE_ONE = ["create", "update", "upsert", "delete"]
const WRITE_MANY = ["createMany", "updateMany", "deleteMany"]
const COUNTERS = ["count"]
const ALL_METHODS = [
  ...READ_ONE,
  ...READ_MANY,
  ...WRITE_ONE,
  ...WRITE_MANY,
  ...COUNTERS,
  "aggregate",
  "groupBy"
]

const clone = (value) =>
  value === null || value === undefined ? value : structuredClone(value)

function modelKeys() {
  return Object.keys(prisma).filter(
    (key) => !key.startsWith("$") && !key.startsWith("_") && key !== "constructor"
  )
}

export function installPrismaDouble({ documents = {}, overrides = {} } = {}) {
  const originals = new Map()
  const calls = []
  const state = { ...clone(documents) }

  const buildModel = (model) => {
    const handlers = {}
    for (const method of ALL_METHODS) {
      handlers[method] = async (args) => {
        calls.push({ seq: nextSeq(), model, method, args: clone(args) })

        const override = overrides?.[model]?.[method]
        if (typeof override === "function") return override(args, state)

        if (READ_ONE.includes(method)) return clone(state[model] ?? null)
        if (READ_MANY.includes(method)) return clone(state[`${model}Many`] ?? [])
        if (COUNTERS.includes(method)) return 0
        if (method === "aggregate" || method === "groupBy") return []
        if (WRITE_MANY.includes(method)) return { count: 0 }

        if (method === "delete") {
          const previous = clone(state[model] ?? null)
          state[model] = null
          return previous
        }

        // create / update / upsert: сливаем data в состояние и отдаём результат.
        // Резолверы ФАП используют возвращённый документ для лога и публикации,
        // поэтому он обязан быть слитым, а не голым args.data.
        const patch = args?.data ?? args?.create ?? {}
        const next = { ...(state[model] ?? {}), ...clone(patch) }
        if (!next.id) next.id = `${model}-double-id`
        state[model] = next
        return clone(next)
      }
    }
    return handlers
  }

  for (const model of modelKeys()) {
    originals.set(model, prisma[model])
    prisma[model] = buildModel(model)
  }

  originals.set("$transaction", prisma.$transaction)
  prisma.$transaction = async (operations) => {
    calls.push({ seq: nextSeq(), model: "$transaction", method: "call", args: null })
    if (Array.isArray(operations)) return Promise.all(operations)
    return operations(prisma)
  }

  return {
    calls,
    state,
    callsTo(model, method) {
      return calls.filter((c) => c.model === model && (!method || c.method === method))
    },
    restore() {
      for (const [key, value] of originals) prisma[key] = value
    }
  }
}
