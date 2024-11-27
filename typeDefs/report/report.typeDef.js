const reportTypeDef = `#graphql
scalar Date

type Query {
  # Получение отчётов для диспетчера
  getDispatcherReport(filter: ReportFilterInput): [DispatcherReport!]!

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

# Отчёт для диспетчера
type DispatcherReport {
  airlineName: String
  hotelName: String
  personName: String
  totalLivingCost: Float
  totalMealCost: Float
  totalDispatcherFee: Float
  balance: Float
}

# Отчёт для авиакомпании
type AirlineReport {
  airlineName: String
  personName: String
  totalDispatcherFee: Float
  debtToDispatcher: Float
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
