const reportTypeDef = `#graphql
scalar Date

type Query {
  # Получение отчётов для авиакомпаний
  getAirlineReport(filter: ReportFilterInput): [AirlineReport!]!

  # Получение отчётов для отелей
  getHotelReport(filter: ReportFilterInput): [HotelReport!]!
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

`

export default reportTypeDef
