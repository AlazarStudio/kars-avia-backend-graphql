// Ограничитель распознавания документов.
//
// Каждый вызов recognizePassengerDocument — это ДВА платных обращения в
// Yandex Cloud: OCR модели "page" и GPT. Ограничителя в цепочке не было ни
// одного, а на /graphql нет и express-лимитера — он навешен только на
// REST-роуты /api/auth.
//
// Окно скользящее и живёт в памяти процесса. Этого достаточно против
// зациклившегося клиента и скомпрометированного магик-линка; от
// распределённой атаки — нет, для этого нужен общий Redis, и это отдельная
// работа.
//
// Порог подобран под рабочий сценарий: гостиница сканирует посадочные пачкой
// по 20-40 человек подряд, поэтому окно меньше минуты сломало бы приёмку.
//
// Счётчик живёт в памяти ОДНОГО процесса. entrypoint.sh поднимает один
// (exec node server2.js), но в package.json есть и режим pm2 в кластере
// ("pm": "pm2 start server.js -i max") — там фактический потолок умножается
// на число воркеров, потому что у каждого своя Map.

const DEFAULT_LIMIT = 40
const DEFAULT_WINDOW_MS = 60_000

export function createRecognitionRateLimiter({
  limit = DEFAULT_LIMIT,
  windowMs = DEFAULT_WINDOW_MS,
  clock = () => Date.now()
} = {}) {
  const hits = new Map()

  const sweep = (now) => {
    for (const [key, stamps] of hits) {
      const alive = stamps.filter((at) => now - at < windowMs)
      if (alive.length) hits.set(key, alive)
      else hits.delete(key)
    }
  }

  return {
    check(key) {
      if (!key) return false
      const now = clock()
      sweep(now)
      const stamps = hits.get(key) ?? []
      // Отказ не записываем: иначе заблокированный клиент, долбящий в цикле,
      // продлевал бы себе блокировку бесконечно.
      if (stamps.length >= limit) return false
      stamps.push(now)
      hits.set(key, stamps)
      return true
    },
    size() {
      return hits.size
    }
  }
}

export const recognitionRateLimiter = createRecognitionRateLimiter()
