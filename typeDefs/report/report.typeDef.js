const reportTypeDef = `#graphql
scalar Date

type Query {
  # Получение отчётов для авиакомпаний
  getAirlineReport(filter: ReportFilterInput): [AirlineReport!]!

  # Получение отчётов для отелей
  getHotelReport(filter: ReportFilterInput): [HotelReport!]!
}

type Mutation {
  # Создание и сохранение отчёта
  createReport(input: CreateReportInput!): SavedReport!
}

# Фильтры для запросов
input ReportFilterInput {
  startDate: String
  endDate: String
  archived: Boolean
  personId: String
  hotelId: String
  airlineId: String
}

# Входные данные для создания отчёта
input CreateReportInput {
  filter: ReportFilterInput!
  type: String! # Тип отчёта: "airline" или "hotel"
  format: String! # Формат отчёта: "pdf" или "excel"
}

# Отчёт для авиакомпании
type AirlineReport {
  airlineId: String
  airline: Airline
  reports: [SavedReport]
}

# Отчёт для отеля
type HotelReport {
  hotelId: String
  hotel: Hotel
  reports: [SavedReport]
}

# Сохранённый отчёт
type SavedReport {
  id: ID!
  name: String!
  url: String! # Ссылка для загрузки отчёта
  startDate: Date! # Начальная дата
  endDate: Date!   # Конечная дата
  createdAt: Date!
  hotelId: String
  hotel: Hotel
  airlineId: String
  airline: Airline
}

type Subscription {
  reportCreated: SavedReport!
}

`

export default reportTypeDef
