// Оснастка характеризационных тестов ФАП: перехват публикаций, приведение
// снимка к сравнимому виду и освобождение Redis.

import { after } from "node:test"
import { pubsub, disconnectPubSubRedis } from "../../services/infra/pubsub.js"
import { nextSeq } from "./seq.js"

const ISO_DATE = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d{1,3})?Z?$/
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

// Мутации кладут в документ new Date() и uuidv4(). Без замены на маркеры
// снимок отличался бы при каждом прогоне, и golden master был бы бесполезен.
// Ключи сортируются, чтобы порядок полей не влиял на сравнение.
export function normalizeSnapshot(value) {
  if (value instanceof Date) return "<DATE>"
  if (Array.isArray(value)) return value.map(normalizeSnapshot)
  if (value && typeof value === "object") {
    const out = {}
    for (const key of Object.keys(value).sort()) {
      out[key] = normalizeSnapshot(value[key])
    }
    return out
  }
  if (typeof value === "string") {
    if (ISO_DATE.test(value)) return "<DATE>"
    if (UUID.test(value)) return "<UUID>"
  }
  return value
}

// pubsub.publish — метод объекта-обёртки, поэтому присваивание перекрывает его
// собственным свойством. restore() возвращает исходное.
export function installPubsubSpy() {
  const original = pubsub.publish
  const published = []
  pubsub.publish = async (topic, payload) => {
    published.push({ seq: nextSeq(), topic, payload })
  }
  return {
    published,
    restore() {
      pubsub.publish = original
    }
  }
}

// ОБЯЗАТЕЛЬНО вызывать один раз в каждом файле, который прямо или косвенно
// импортирует резолвер ФАП или сам pubsub.
//
// services/infra/pubsub.js на вычислении модуля вызывает createPubSubEngine()
// и при непустом REDIS_URL открывает два клиента ioredis. Клиенты держат
// процесс, и node --test перестаёт завершаться — виснет вся сюита, а не один
// файл. В репозитории есть .env с REDIS_URL и load-env.js, так что это не
// теория. При пустом REDIS_URL вызов ничего не делает.
export function releasePubsubAfterTests() {
  after(async () => {
    await disconnectPubSubRedis()
  })
}
