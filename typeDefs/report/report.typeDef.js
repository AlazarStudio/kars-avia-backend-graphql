const reportTypeDef = `#graphql
scalar Date

enum ReportFormat {
  pdf
  xlsx
}

type Query {
  # Получение отчётов для авиакомпаний
  getAirlineReport(filter: ReportFilterInput): [AirlineReport!]!
  # Получение отчётов для отелей
  getHotelReport(filter: ReportFilterInput): [HotelReport!]!
}

type Mutation {
  # Создание и сохранение отчёта для авиакомпании
  createAirlineReport(input: CreateReportInput!): SavedReport!
  # Создание и сохранение отчёта для отеля
  createHotelReport(input: CreateReportInput!): SavedReport!
  deleteReport(id: ID!): SavedReport!
}

# Фильтры для запросов отчётов
input ReportFilterInput {
  startDate: Date
  endDate: Date
  archived: Boolean
  hotelId: ID
  airlineId: ID
  airportId: ID
  personId: ID
  positionId: String
  region: String
  passengersReport: Boolean 
}


# Входные данные для создания отчёта
input CreateReportInput {
  filter: ReportFilterInput!
  format: ReportFormat!   # Формат отчёта: PDF или EXCEL
}

# Отчёт для авиакомпании
type AirlineReport {
  airlineId: ID
  airline: Airline
  reports: [SavedReport]
}

# Отчёт для отеля
type HotelReport {
  hotelId: ID
  hotel: Hotel
  reports: [SavedReport]
}

# Сохранённый отчёт
type SavedReport {
  id: ID!
  name: String!
  url: String!         # Ссылка для загрузки отчёта
  startDate: Date!     # Начальная дата
  endDate: Date!       # Конечная дата
  createdAt: Date!
  hotelId: ID
  hotel: Hotel
  airlineId: ID
  airline: Airline
  archived: Boolean
}

type Subscription {
  reportCreated: SavedReport!
}
`

export default reportTypeDef
