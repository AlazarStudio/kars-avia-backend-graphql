// Реестры услуг ФАП за период: доставка багажа (BAGGAGE) и вода/питание (CATERING).
// Строки — снимок на момент формирования (services/passengerRequest/registryRows.js),
// стадии — как у отчёта гостиницы без «цены согласованы».

const registryTypeDef = /* GraphQL */ `
  #graphql
  enum PassengerServiceRegistryKind {
    BAGGAGE
    CATERING
  }

  enum PassengerServiceRegistryStage {
    DRAFT
    SUBMITTED
    RETURNED
    APPROVED
  }

  "Шапка реестра — снимок при формировании, правится до утверждения"
  type PassengerServiceRegistryHeader {
    appendixLabel: String
    contractNumber: String
    contractDate: String
    executorName: String
    executorTitle: String
    executorSignatory: String
    customerName: String
    customerTitle: String
    customerSignatory: String
  }

  input PassengerServiceRegistryHeaderInput {
    appendixLabel: String
    contractNumber: String
    contractDate: String
    executorName: String
    executorTitle: String
    executorSignatory: String
    customerName: String
    customerTitle: String
    customerSignatory: String
  }

  """
  Строка снимка. Багажные поля заполнены у BAGGAGE, поля поставки — у CATERING.
  driverName/driverCost/distanceKm/supplierCost авиакомпании отдаются null.
  """
  type PassengerServiceRegistryRow {
    requestId: ID
    requestNumber: String
    flightNumber: String
    flightDate: Date
    fullName: String
    baggageTags: [String!]
    addressTo: String
    deliveredAt: Date
    price: Float
    tripId: String
    driverName: String
    driverCost: Float
    distanceKm: Float
    serviceKind: PassengerWaterFoodKind
    suppliedAt: Date
    quantity: Int
    unitPrice: Float
    amount: Float
    deliveryCost: Float
    total: Float
    supplier: String
    supplierCost: Float
  }

  type PassengerServiceRegistryTotals {
    rowsCount: Int!
    airlineTotal: Float!
    "Σ стоимости водителю (по поездкам) или поставщику; авиакомпании null"
    internalCost: Float
  }

  type PassengerServiceRegistry {
    id: ID!
    createdAt: Date!
    updatedAt: Date!
    kind: PassengerServiceRegistryKind!
    airlineId: ID!
    airline: Airline
    airportId: ID!
    airport: Airport
    periodStart: Date!
    periodEnd: Date!
    number: String!
    header: PassengerServiceRegistryHeader!
    rows: [PassengerServiceRegistryRow!]!
    totals: PassengerServiceRegistryTotals!
    stage: PassengerServiceRegistryStage!
    createdById: ID
    submittedAt: Date
    airlineApprovedAt: Date
    airlineComment: String
    airlineCommentAt: Date
  }

  type PassengerServiceRegistryContract {
    number: String
    date: Date
  }

  "Подсказки формы формирования: последний номер, шапка предыдущего реестра, договор АК"
  type PassengerServiceRegistryDefaults {
    lastNumber: String
    header: PassengerServiceRegistryHeader
    contract: PassengerServiceRegistryContract
  }

  input PassengerServiceRegistryFilterInput {
    kind: PassengerServiceRegistryKind
    airlineId: ID
    airportId: ID
    "Границы периода фильтра (YYYY-MM-DD); реестр подходит, если его период пересекается"
    dateFrom: Date
    dateTo: Date
    stage: PassengerServiceRegistryStage
  }

  input PassengerServiceRegistryCreateInput {
    kind: PassengerServiceRegistryKind!
    airlineId: ID!
    airportId: ID!
    "YYYY-MM-DD, московские сутки"
    periodStart: Date!
    periodEnd: Date!
    number: String!
    header: PassengerServiceRegistryHeaderInput!
  }

  "Семантика: отсутствие ключа => не трогаем. Смена периода пересобирает строки"
  input PassengerServiceRegistryPatchInput {
    number: String
    header: PassengerServiceRegistryHeaderInput
    periodStart: Date
    periodEnd: Date
  }

  type Query {
    passengerServiceRegistries(
      filter: PassengerServiceRegistryFilterInput
      skip: Int
      take: Int
    ): [PassengerServiceRegistry!]!
    passengerServiceRegistry(id: ID!): PassengerServiceRegistry
    passengerServiceRegistryDefaults(
      kind: PassengerServiceRegistryKind!
      airlineId: ID!
    ): PassengerServiceRegistryDefaults!
  }

  type Mutation {
    "Сформировать реестр: собрать снимок строк по заявкам АК в аэропорту за период. Только диспетчер"
    createPassengerServiceRegistry(input: PassengerServiceRegistryCreateInput!): PassengerServiceRegistry!
    "Правка номера, шапки, периода. Утверждённый реестр заморожен"
    updatePassengerServiceRegistry(id: ID!, patch: PassengerServiceRegistryPatchInput!): PassengerServiceRegistry!
    "Пересобрать снимок строк по текущим данным заявок. Утверждённый реестр заморожен"
    rebuildPassengerServiceRegistry(id: ID!): PassengerServiceRegistry!
    "Удалить неотправленный реестр"
    deletePassengerServiceRegistry(id: ID!): Boolean!
    "Отправить авиакомпании: с этого момента она видит реестр; письмо и уведомление"
    submitPassengerServiceRegistry(id: ID!): PassengerServiceRegistry!
    "Отозвать отправку неутверждённого реестра"
    unsubmitPassengerServiceRegistry(id: ID!): PassengerServiceRegistry!
    """
    Утвердить (true) или отозвать утверждение (false) — только субъект авиакомпании.
    При отзыве comment обязателен. Письмо и уведомление диспетчерам.
    """
    setPassengerServiceRegistryAirlineApproved(
      id: ID!
      approved: Boolean!
      comment: String
    ): PassengerServiceRegistry!
  }
`

export default registryTypeDef
