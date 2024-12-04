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
  airlineName: String
  personName: String
  totalLivingCost: Float
  totalMealCost: Float
  totalDebt: Float
}

# Отчёт для отеля
type HotelReport {
  hotelName: String
  personName: String
  totalLivingCost: Float
  totalMealCost: Float
  totalDebt: Float
}

# Сохранённый отчёт
type SavedReport {
  id: ID!
  name: String!
  url: String! # Ссылка для загрузки отчёта
  createdAt: Date!
}

`

export default reportTypeDef
