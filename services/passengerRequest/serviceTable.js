// Таблица семи встроенных услуг заявки ФАП.
//
// Каркасный резолвер перечислял услуги руками трижды: дефолты при создании
// заявки, пересчёт статуса при правке планов и точечная смена статуса услуги.
// Перечни жили копипастой и уже разъехались между собой — например, защита от
// легаси-выселений есть только в смене статуса. Пропуск услуги в одном из
// перечней не падает, а молча теряет запись, поэтому список сведён в одно
// место.
//
// В таблице лежат ТОЛЬКО те различия, что есть в коде; всё, что у семи услуг
// одинаково, осталось в резолвере. Расхождения между тремя местами тоже
// сохранены как есть — они наблюдаемы и закреплены характеризационными тестами.

import {
  emptyDriversService,
  emptyLivingService,
  emptyPeopleService
} from "./envelope.js"
import { transferFactCount } from "./serviceStatus.js"

// Факт услуги: у воды и питания — поимённый список получателей, у проживания —
// сумма людей по гостиницам, у водительских — список либо «перевезено N» на
// поездке (max), см. serviceStatus.js. Для багажа transportedCount пуст, так
// что результат совпадает с прежним Σ people.length.
const peopleFact = (prev) => (prev?.people || []).length

const hotelsFact = (prev) =>
  (prev?.hotels || []).reduce((sum, h) => sum + (h?.people?.length || 0), 0)

const driversFact = (prev) => transferFactCount(prev?.drivers)

// Урезанный дефолт услуги в setPassengerRequestServiceStatus. Намеренно НЕ
// совпадает с empty(): там услуга рождается целиком (с планом и отметками
// досрочного завершения), а здесь в документ уходит только пустая коллекция и
// новый статус. Подмена одного другим меняет записываемый документ.
const blankPeople = () => ({ people: [] })
const blankLiving = () => ({ hotels: [], evictions: [] })
const blankDrivers = () => ({ drivers: [] })

// service — значение энума на входе setPassengerRequestServiceStatus,
// field — имя embedded-поля документа и ключ во входе заявки.
export const PASSENGER_SERVICE_TABLE = [
  {
    service: "WATER",
    field: "waterService",
    empty: emptyPeopleService,
    statusFallback: blankPeople,
    factCount: peopleFact,
    hasDrivers: false,
    statusExtra: null
  },
  {
    service: "MEAL",
    field: "mealService",
    empty: emptyPeopleService,
    statusFallback: blankPeople,
    factCount: peopleFact,
    hasDrivers: false,
    statusExtra: null
  },
  {
    service: "LIVING",
    field: "livingService",
    empty: emptyLivingService,
    statusFallback: blankLiving,
    factCount: hotelsFact,
    hasDrivers: false,
    // Единственная защита от легаси-документов, у которых вместо списка
    // выселений лежит null. Стоит только в смене статуса услуги: правка планов
    // её не делает, и перенести её туда нельзя — это изменит запись.
    statusExtra: (prev) => ({ evictions: prev.evictions || [] })
  },
  {
    service: "TRANSFER",
    field: "transferService",
    empty: emptyDriversService,
    statusFallback: blankDrivers,
    factCount: driversFact,
    hasDrivers: true,
    statusExtra: null
  },
  {
    service: "DEPARTURE_TRANSFER",
    field: "departureTransferService",
    empty: emptyDriversService,
    statusFallback: blankDrivers,
    factCount: driversFact,
    hasDrivers: true,
    statusExtra: null
  },
  {
    service: "INTERCITY_TRANSFER",
    field: "intercityTransferService",
    empty: emptyDriversService,
    statusFallback: blankDrivers,
    factCount: driversFact,
    hasDrivers: true,
    statusExtra: null
  },
  {
    service: "BAGGAGE_DELIVERY",
    field: "baggageDeliveryService",
    empty: emptyDriversService,
    statusFallback: blankDrivers,
    factCount: driversFact,
    hasDrivers: true,
    statusExtra: null
  }
]

// Сервисные ключи входа заявки: копировать их в data как есть нельзя — у
// каждого свой разбор с дефолтами и пересчётом статуса. Список нужен там, где
// остаток входа уходит в документ россыпью.
export const PASSENGER_SERVICE_FIELDS = new Set(
  PASSENGER_SERVICE_TABLE.map((entry) => entry.field)
)

// Валидации имени услуги в резолвере нет: неизвестное имя даёт пустой апдейт,
// а не отказ. Поэтому «не нашли» — обычный результат, а не ошибка.
export const findPassengerService = (service) =>
  PASSENGER_SERVICE_TABLE.find((entry) => entry.service === service) || null
