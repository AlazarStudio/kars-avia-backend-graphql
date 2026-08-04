// Чистые функции услуги «Доставка багажа» ФАП.
// Живут отдельно от резолвера, чтобы тестироваться без БД и GraphQL.
//
// Модель услуги: запись в drivers[] — это ПОЕЗДКА водителя со списком пассажиров.
// Бирки, цена и адрес доставки принадлежат пассажиру (drivers[].people[]),
// а сумма поездки производная — сумма цен её пассажиров.

// Номера багажных бирок: тримим, выкидываем пустые и нестроки,
// схлопываем дубли без учёта регистра. Порядок ввода сохраняем.
export const normalizeBaggageTags = (tags) => {
  if (!Array.isArray(tags)) return []
  const seen = new Set()
  const out = []
  for (const raw of tags) {
    const value = typeof raw === "string" ? raw.trim() : ""
    if (!value) continue
    const key = value.toUpperCase()
    if (seen.has(key)) continue
    seen.add(key)
    out.push(value)
  }
  return out
}

const has = (obj, key) => obj != null && Object.prototype.hasOwnProperty.call(obj, key)

// Деньги: число либо null. Ноль — валидная цена и null-ом не становится.
// Округляем до копеек здесь, на уровне ОТДЕЛЬНОГО пассажира: хвост от клиента
// (1500.005 или результат его собственной арифметики) в базу уходить не должен,
// округления одного лишь итога поездки для этого мало.
// Отрицательная стоимость доставки бессмысленна — трактуем как отсутствие цены,
// иначе минус у одного пассажира молча уменьшил бы сумму всей поездки.
const toMoney = (value) => {
  if (value == null) return null
  if (typeof value === "string" && !value.trim()) return null
  const num = Number(value)
  if (!Number.isFinite(num) || num < 0) return null
  return Math.round(num * 100) / 100
}

// Ожидаемое количество пассажиров поездки: целое число ≥ 0 либо null.
// Тот же подход, что у toMoney — нечисловое, отрицательное и дробное
// трактуем как отсутствие значения, а не бросаем ошибку.
const toWholeCountOrNull = (value) => {
  if (value == null) return null
  if (typeof value === "string" && !value.trim()) return null
  const num = Number(value)
  if (!Number.isFinite(num) || num < 0 || !Number.isInteger(num)) return null
  return num
}

const toTrimmedOrNull = (value) => {
  if (typeof value !== "string") return null
  return value.trim() || null
}

// Приводит одного пассажира поездки к виду, пригодному для записи.
// Ловушка Prisma: скалярный список внутри composite-типа (drivers[].people[].baggageTags)
// у документов, созданных до появления поля, читается как null (в отличие от списков
// на уровне модели, где работает коэрция в []), а обратно null в String[] Prisma не
// принимает — валидация payload падает с «Argument 'baggageTags' is missing».
// Легаси-пассажиров в базе много, в том числе у трансфера: composite-тип общий на все
// четыре сервиса. Поэтому любого пассажира, прочитанного из БД, перед уходом в data
// прогоняем через этот хелпер. Остальные поля пассажира не трогаем.
export const normalizeDriverPerson = (person) => ({
  ...person,
  baggageTags: normalizeBaggageTags(person?.baggageTags),
  reportCost: toMoney(person?.reportCost),
  addressTo: toTrimmedOrNull(person?.addressTo)
})

const normalizePeopleForWrite = (people) =>
  Array.isArray(people) ? people.map((person) => normalizeDriverPerson(person)) : []

// Приводит массив водителей к виду, пригодному для записи в composite-тип:
// чинит пассажиров у каждой поездки. Остальные поля водителя не трогаем,
// вход не мутируем.
//
// ВНИМАНИЕ: пассажиров мы не фильтруем по белому списку, а спредим как есть.
// Это безопасно ровно до тех пор, пока на вход подают СЫРЬЁ из Prisma
// (в резолвере — loadRequestOrThrow). hydratePassengerRequest добавляет
// пассажиру ключ seat, которого нет в composite-типе PassengerServiceDriverPerson,
// и такой пассажир уронит запись на неизвестном аргументе. См. предупреждение
// у loadRequestOrThrow в services/passengerRequest/envelope.js.
export const normalizeDriversForWrite = (drivers) => {
  if (!Array.isArray(drivers)) return []
  return drivers.map((driver) => ({
    ...driver,
    people: normalizePeopleForWrite(driver?.people)
  }))
}

// Сумма поездки = сумма цен её пассажиров. Округляем до копеек, чтобы
// плавающая арифметика не давала хвост вида 0.30000000000000004.
export const sumPeopleCost = (people) => {
  if (!Array.isArray(people)) return 0
  const total = people.reduce((acc, person) => {
    const cost = toMoney(person?.reportCost)
    return cost == null ? acc : acc + cost
  }, 0)
  return Math.round(total * 100) / 100
}

// Сумма поездки для записи в driver.reportCost. Пустой список пассажиров даёт
// null, а не 0: считать не из чего. Ноль оставляем за случаем «пассажиры есть,
// цены не проставлены» — в отчётности это разные состояния, и поле в схеме
// нулевое (Float?) именно под «суммы нет».
export const tripReportCost = (people) =>
  people?.length ? sumPeopleCost(people) : null

// Собирает из патча ТОЛЬКО реально переданные поля.
// Отличаем «ключа нет» от «ключ есть, значение null»: иначе нельзя очистить
// дату доставки. Сумма поездки производная — патчем не принимается,
// бирки живут на пассажире — на уровне водителя ключ игнорируем.
export const collectBaggageDriverPatch = (patch = {}) => {
  const applied = {}
  if (has(patch, "vehicleType")) {
    const value = typeof patch.vehicleType === "string" ? patch.vehicleType.trim() : ""
    applied.vehicleType = value || null
  }
  if (has(patch, "deliveryCompletedAt")) {
    const raw = patch.deliveryCompletedAt
    const date = raw == null ? null : new Date(raw)
    applied.deliveryCompletedAt =
      date && !Number.isNaN(date.getTime()) ? date : null
  }
  if (has(patch, "people")) {
    applied.people = normalizePeopleForWrite(patch.people)
  }
  if (has(patch, "peopleCount")) {
    applied.peopleCount = toWholeCountOrNull(patch.peopleCount)
  }
  return applied
}
