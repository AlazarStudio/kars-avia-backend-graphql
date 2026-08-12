const reportTypeDef = /* GraphQL */ `
  #graphql
  scalar Date

  enum ReportFormat {
    pdf
    xlsx
  }

  enum ReportPartialDayLevel {
    GLOBAL
    AIRLINE
    HOTEL
  }

  enum ReportDraftType {
    AIRLINE
    HOTEL
  }

  enum ReportDraftStatus {
    DRAFT
    CONFIRMED
  }

  type Query {
    # Получение отчётов для авиакомпаний
    getAirlineReport(filter: ReportFilterInput): [AirlineReport!]!
    # Получение отчётов для отелей
    getHotelReport(filter: ReportFilterInput): [HotelReport!]!

    reportPartialDaySettings(
      level: ReportPartialDayLevel
      airlineId: ID
      hotelId: ID
    ): [ReportPartialDaySetting!]!

    reportDraft(id: ID!): ReportDraft
    reportDrafts(filter: ReportDraftFilterInput): [ReportDraft!]!
  }

  type Mutation {
    # Создание и сохранение отчёта для авиакомпании
    createAirlineReport(
      input: CreateReportInput!
      createFilterInput: createFilterInput
    ): SavedReport!
    # Создание и сохранение отчёта для отеля
    createHotelReport(
      input: CreateReportInput!
      createFilterInput: createFilterInput
    ): SavedReport!
    deleteReport(id: ID!): SavedReport!

    upsertReportPartialDaySetting(
      input: UpsertReportPartialDaySettingInput!
    ): ReportPartialDaySetting!
    deleteReportPartialDaySetting(id: ID!): Boolean!

    createAirlineReportDraft(
      input: CreateReportInput!
      createFilterInput: createFilterInput
    ): ReportDraft!
    createHotelReportDraft(
      input: CreateReportInput!
      createFilterInput: createFilterInput
    ): ReportDraft!
    updateReportDraft(id: ID!, rows: [ReportDraftRowInput!]!): ReportDraft!
    confirmReportDraft(id: ID!, format: ReportFormat): SavedReport!
    deleteReportDraft(id: ID!): Boolean!
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
    position: PositionFilter
    region: String
    passengersReport: Boolean
  }

  enum PositionFilter {
    all
    squadron
    technician
  }

  input createFilterInput {
    meal: Boolean
    living: Boolean
  }

  # Входные данные для создания отчёта
  input CreateReportInput {
    filter: ReportFilterInput!
    format: ReportFormat! # Формат отчёта: PDF или EXCEL
  }

  input UpsertReportPartialDaySettingInput {
    id: ID
    level: ReportPartialDayLevel!
    airlineId: ID
    hotelId: ID
    arrivalFullBefore: String
    arrivalHalfBefore: String
    departureHalfAfter: String
    departureFullAfter: String
    arrivalFullDays: Float
    arrivalHalfDays: Float
    departureHalfDays: Float
    departureFullDays: Float
  }

  type ReportPartialDaySetting {
    id: ID!
    level: ReportPartialDayLevel!
    airlineId: ID
    hotelId: ID
    airline: Airline
    hotel: Hotel
    arrivalFullBefore: String!
    arrivalHalfBefore: String!
    departureHalfAfter: String!
    departureFullAfter: String!
    arrivalFullDays: Float!
    arrivalHalfDays: Float!
    departureHalfDays: Float!
    departureFullDays: Float!
    createdAt: Date!
    updatedAt: Date!
  }

  input ReportDraftFilterInput {
    type: ReportDraftType
    status: ReportDraftStatus
    airlineId: ID
    hotelId: ID
  }

  type ReportShareSegment {
    start: String!
    end: String!
    alone: Boolean!
    cohabitants: [ReportCohabitant!]!
  }

  type ReportCohabitant {
    requestId: ID
    personName: String!
  }

  type ReportPresentationColumn {
    key: String!
    header: String!
    width: Int
  }

  type ReportPresentationCell {
    key: String!
    value: String!
    raw: String
  }

  type ReportPresentationRow {
    cells: [ReportPresentationCell!]!
  }

  type ReportPresentationHeader {
    companyNameFull: String
    contractName: String
    city: String
    title: String
  }

  type ReportPresentation {
    header: ReportPresentationHeader!
    columns: [ReportPresentationColumn!]!
    dataRows: [ReportPresentationRow!]!
    totalsRow: ReportPresentationRow
  }

  type ReportDraftRow {
    index: Int
    requestId: ID
    arrival: String
    departure: String
    totalDays: Float
    category: String
    personName: String
    personPosition: String
    roomName: String
    roomId: ID
    shareNote: String
    shareSegments: [ReportShareSegment!]!
    roomGroupId: String
    shareClusterId: String
    breakfastCount: Int
    lunchCount: Int
    dinnerCount: Int
    breakfastIncludedInPrice: Boolean
    totalMealCost: Float
    totalLivingCost: Float
    pricePerDay: Float
    totalDebt: Float
    hotelName: String
  }

  input ReportCohabitantInput {
    requestId: ID
    personName: String
  }

  input ReportShareSegmentInput {
    start: String
    end: String
    alone: Boolean
    cohabitants: [ReportCohabitantInput!]
  }

  input ReportDraftRowInput {
    index: Int
    requestId: ID
    arrival: String
    departure: String
    totalDays: Float
    category: String
    personName: String
    personPosition: String
    roomName: String
    roomId: ID
    shareNote: String
    shareSegments: [ReportShareSegmentInput!]
    roomGroupId: String
    shareClusterId: String
    breakfastCount: Int
    lunchCount: Int
    dinnerCount: Int
    breakfastIncludedInPrice: Boolean
    totalMealCost: Float
    totalLivingCost: Float
    pricePerDay: Float
    totalDebt: Float
    hotelName: String
  }

  type ReportDraftFilterSnapshot {
    startDate: Date
    endDate: Date
    airlineId: ID
    hotelId: ID
    airportId: ID
    personId: ID
    positionId: String
    position: String
    region: String
    passengersReport: Boolean
    meal: Boolean
    living: Boolean
    format: ReportFormat
    companyName: String
    companyNameFull: String
    companyCity: String
    contractName: String
  }

  type ReportDraft {
    id: ID!
    type: ReportDraftType!
    status: ReportDraftStatus!
    airlineId: ID
    hotelId: ID
    airline: Airline
    hotel: Hotel
    startDate: Date!
    endDate: Date!
    filterJson: ReportDraftFilterSnapshot
    rows: [ReportDraftRow!]!
    presentation: ReportPresentation!
    savedReportId: ID
    savedReport: SavedReport
    createdById: ID
    confirmedAt: Date
    createdAt: Date!
    updatedAt: Date!
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
    url: String! # Ссылка для загрузки отчёта
    startDate: Date! # Начальная дата
    endDate: Date! # Конечная дата
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
