// Фикстура заявки ФАП для характеризационных тестов.
//
// Форма списана с реального документа: услуги — встроенные composite-типы,
// люди адресуются индексом массива. Фикстура намеренно содержит две гостиницы
// и людей в обеих — тесты пачечных операций опираются на съезд индексов.

// ⚠️ Поле плана называется peopleCount, а не count: именно его читает
// recomputeServiceStatus (services/passengerRequest/serviceStatus.js).
// План с любым другим ключом движок считает отсутствующим и статус не
// автозавершает — на этом легко построить тест, который молча проверяет
// не ту ветку.
export function makeRequest(overrides = {}) {
  return {
    id: "req-1",
    requestNumber: "0001ABA0826f",
    flightNumber: "TEST001",
    flightDate: "2026-08-04T00:00:00.000Z",
    airlineId: "airline-1",
    airportId: "airport-1",
    status: "CREATED",
    // Композит PassengerStatusTimes несёт только acceptedAt/inProgressAt/
    // finishedAt/cancelledAt. У заявки в CREATED отметок нет вовсе: ветки
    // CREATED у updateTimes не существует.
    statusTimes: {},
    savedPassengers: [
      {
        personId: "aaaaaaaa-0000-4000-8000-000000000001",
        fullName: "Иванов Иван",
        personType: "PASSENGER",
        personCategory: "ADULT"
      },
      {
        personId: "aaaaaaaa-0000-4000-8000-000000000002",
        fullName: "Петров Пётр",
        personType: "PASSENGER",
        personCategory: "CHILD"
      }
    ],
    passengerGroups: [],
    waterService: {
      plan: { enabled: true, peopleCount: 4 },
      status: "IN_PROGRESS",
      times: { acceptedAt: "2026-08-01T10:00:00.000Z" },
      people: [
        {
          personId: "aaaaaaaa-0000-4000-8000-000000000001",
          fullName: "Иванов Иван",
          personType: "PASSENGER",
          personCategory: "ADULT"
        }
      ]
    },
    mealService: {
      plan: { enabled: true, peopleCount: 4 },
      status: "NEW",
      times: {},
      people: []
    },
    livingService: {
      plan: { enabled: true, peopleCount: 4 },
      status: "IN_PROGRESS",
      times: { acceptedAt: "2026-08-01T10:00:00.000Z" },
      evictions: [],
      hotels: [
        {
          itemId: "bbbbbbbb-0000-4000-8000-000000000001",
          hotelId: "hotel-1",
          name: "Азия",
          address: "г. Абакан, ул. Ленина, 1",
          peopleCount: 2,
          people: [
            {
              personId: "aaaaaaaa-0000-4000-8000-000000000001",
              fullName: "Иванов Иван",
              personType: "PASSENGER",
              personCategory: "ADULT",
              roomNumber: "101",
              arrival: null,
              departure: null,
              roomCategory: null,
              roomKind: null,
              airlinePersonalId: null,
              accommodationChesses: [
                {
                  hotelIndex: 0,
                  hotelName: "Азия",
                  startAt: "2026-08-04T12:00:00.000Z",
                  endAt: null,
                  reason: null
                }
              ]
            }
          ]
        },
        {
          itemId: "bbbbbbbb-0000-4000-8000-000000000002",
          hotelId: "hotel-2",
          name: "Чаплан",
          address: "г. Абакан, ул. Мира, 5",
          peopleCount: 2,
          people: []
        }
      ]
    },
    transferService: {
      plan: { enabled: true, peopleCount: 4 },
      status: "NEW",
      times: {},
      drivers: []
    },
    departureTransferService: {
      plan: { enabled: false, peopleCount: 0 },
      status: "NEW",
      times: {},
      drivers: []
    },
    intercityTransferService: {
      plan: { enabled: false, peopleCount: 0 },
      status: "NEW",
      times: {},
      drivers: []
    },
    baggageDeliveryService: {
      plan: { enabled: true, peopleCount: 2 },
      status: "NEW",
      times: {},
      drivers: []
    },
    ...overrides
  }
}

// Контекст диспетчера.
export function makeContext(overrides = {}) {
  return {
    subjectType: "USER",
    subject: { id: "user-1", name: "Диспетчер Тестовый", role: "SUPERADMIN" },
    user: { id: "user-1", name: "Диспетчер Тестовый", role: "SUPERADMIN" },
    ...overrides
  }
}

// Контекст внешнего пользователя-гостиницы (магик-линк PWA).
export function makeHotelContext(hotelId = "hotel-1") {
  return {
    subjectType: "EXTERNAL_USER",
    subject: { id: "ext-1", name: "Гостиница Азия", scope: "HOTEL", hotelId },
    externalUser: { id: "ext-1", name: "Гостиница Азия", scope: "HOTEL", hotelId }
  }
}
