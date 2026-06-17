const travellineTypeDef = /* GraphQL */ `
  #graphql

  # ─── Config ────────────────────────────────────────────────────────────────

  type TlConfig {
    clientId: String
    baseUrl: String!
    isConfigured: Boolean!
  }

  input TlSetConfigInput {
    clientId: String!
    clientSecret: String!
    baseUrl: String!
  }

  # ─── Geo API ───────────────────────────────────────────────────────────────

  type TlCity {
    id: String!
    name: String!
    regionId: String
    countryCode: String!
  }

  input TlSearchPropertiesByCityInput {
    cityId: String!
    count: Int
  }

  # ─── Content API ───────────────────────────────────────────────────────────

  type TlPropertyAddress {
    country: String
    city: String
    street: String
    zip: String
  }

  type TlProperty {
    id: String!
    name: String!
    description: String
    phone: String
    email: String
    address: TlPropertyAddress
    latitude: Float
    longitude: Float
    photos: [String!]
    stars: String
    raw: String!
  }

  type TlPropertiesResult {
    items: [TlProperty!]!
    total: Int!
    page: Int!
    pageSize: Int!
  }

  type TlRoomType {
    id: String!
    name: String!
    description: String
    maxOccupancy: Int
    photos: [String!]
    raw: String!
  }

  type TlRatePlan {
    id: String!
    name: String!
    description: String
    includesBreakfast: Boolean
    raw: String!
  }

  input TlSearchPropertiesInput {
    city: String
    country: String
    page: Int
    pageSize: Int
  }

  # ─── Search API ────────────────────────────────────────────────────────────

  type TlCancellationPolicy {
    amount: Float!
    deadline: String!
    deadlineUtc: String
    timezone: String
  }

  type TlPlacement {
    code: String!
    name: String
    type: String
    capacity: Int
  }

  # Период раннего заезда / позднего выезда с ценой
  type TlTimeService {
    periodFrom: String!
    periodTo: String!
    price: Float!
    currency: String!
  }

  type TlRoomRate {
    roomTypeId: String!
    roomTypeName: String!
    placementName: String
    maxOccupancy: Int
    ratePlanId: String!
    ratePlanName: String!
    priceBeforeTax: Float!
    totalPrice: Float!
    tax: Float
    currency: String!
    availableRooms: Int
    mealType: String
    checkInTime: String
    checkOutTime: String
    timezone: String
    cancellationPolicies: [TlCancellationPolicy!]
    checksum: String
    roomTypePlacements: [String!]
    placements: [TlPlacement!]
    earlyCheckInOptions: [TlTimeService!]
    lateCheckOutOptions: [TlTimeService!]
    corporateIds: [String!]
    raw: String!
  }

  type TlAvailabilityResult {
    propertyId: String!
    rates: [TlRoomRate!]!
    nights: Int!
    raw: String!
  }

  input TlAvailabilityInput {
    propertyId: String!
    arrival: String!
    departure: String!
    adults: Int
    children: Int
    childAges: [Int!]
    currency: String
    corporateIds: [String!]
  }

  # ─── Verify booking ──────────────────────────────────────────────────────

  type TlVerifyResult {
    ok: Boolean!
    conditionChange: Boolean!
    newChecksum: String
    newPriceBeforeTax: Float
    newTotalPrice: Float
    newTax: Float
    message: String
  }

  input TlVerifyInput {
    propertyId: String!
    roomTypeId: String!
    ratePlanId: String!
    arrival: String!
    departure: String!
    adults: Int
    childAges: [Int!]
    checksum: String
    roomTypePlacements: [String!]
    checkInTime: String
    checkOutTime: String
    corporateId: String
    earlyCheckInDateTime: String
    lateCheckOutDateTime: String
  }

  # ─── Cancellation penalty ───────────────────────────────────────────────────

  type TlCancellationPenalty {
    penalty: Float!
    currency: String!
    penaltyType: String
    description: String
  }

  # ─── Calendar ──────────────────────────────────────────────────────────────

  type TlCalendarCell {
    date: String!
    roomTypeId: String!
    roomTypeName: String!
    available: Boolean!
    minPrice: Float
    currency: String
  }

  input TlCalendarInput {
    propertyId: String!
    from: String!
    days: Int
    adults: Int
  }

  # ─── Bulk availability ─────────────────────────────────────────────────────

  type TlPropertyPriceSummary {
    propertyId: String!
    propertyName: String
    hasAvailability: Boolean!
    minPricePerNight: Float
    minTotalPrice: Float
    currency: String
    nights: Int
    hasAnyRate: Boolean
    mealFilterApplied: Boolean
    reason: String
  }

  input TlMealRequirementInput {
    breakfast: Boolean
    lunch: Boolean
    dinner: Boolean
  }

  input TlSearchDatesInput {
    arrival: String!
    departure: String!
    adults: Int
    children: Int
    childAges: [Int!]
    propertyIds: [String!]
    mealRequirement: TlMealRequirementInput
    corporateIds: [String!]
  }

  # ─── Reservation API ─────────────────────────────────────────────────────

  type TlGuestType {
    firstName: String!
    lastName: String!
    email: String
    phone: String
  }

  type TlReservation {
    id: String!
    propertyId: String!
    propertyName: String
    roomTypeId: String!
    ratePlanId: String!
    arrival: String!
    departure: String!
    adults: Int!
    children: Int
    totalPrice: Float!
    currency: String!
    status: String!
    guest: TlGuestType!
    comment: String
    roomTypeName: String
    ratePlanName: String
    cancellationPoliciesJson: String
    earlyCheckInDateTime: String
    lateCheckOutDateTime: String
    corporateId: String
    createdAt: String!
    raw: String!
  }

  type TlAlternative {
    newPriceBeforeTax: Float
    newTax: Float
    newTotalPrice: Float
    newPenaltyAmount: Float
    newChecksum: String
    message: String
    cancellationPolicy: TlCancellationPolicy
  }

  type TlCreateReservationResult {
    reservation: TlReservation
    conditionChange: Boolean!
    alternative: TlAlternative
  }

  input TlGuestInput {
    firstName: String!
    lastName: String!
    email: String
    phone: String
  }

  input TlCreateReservationInput {
    propertyId: String!
    roomTypeId: String!
    ratePlanId: String!
    arrival: String!
    departure: String!
    adults: Int
    children: Int
    childAges: [Int!]
    guest: TlGuestInput!
    booker: TlGuestInput
    comment: String
    checksum: String
    roomTypePlacements: [String!]
    checkInTime: String
    checkOutTime: String
    roomTypeName: String
    ratePlanName: String
    cancellationPoliciesJson: String
    requestId: String
    mealPlanCode: String
    corporateId: String
    earlyCheckInDateTime: String
    lateCheckOutDateTime: String
  }

  # ─── Amend reservation ───────────────────────────────────────────────────────

  input TlAmendReservationInput {
    bookingId: String!
    arrival: String!
    departure: String!
    adults: Int
    childAges: [Int!]
    roomTypePlacements: [String!]
    checkInTime: String
    checkOutTime: String
    corporateId: String
    comment: String
    earlyCheckInDateTime: String
    lateCheckOutDateTime: String
  }

  type TlAmendResult {
    ok: Boolean!
    conditionChange: Boolean!
    newArrival: String
    newDeparture: String
    newTotalPrice: Float
    newChecksum: String
    message: String
  }

  type TlSyncStatus {
    running: Boolean!
    total: Int!
    done: Int!
    currentName: String
    startedAt: String
    finishedAt: String
    error: String
    lastSyncAt: String
    autoSyncHours: Int
  }

  type HotelPlacementOption {
    source: String!
    id: String!
    name: String!
    photo: String
    city: String
    address: String
    stars: String
    description: String
    access: Boolean
    hasRooms: Boolean
  }

  # ─── Extra stays (РЗПВ) ──────────────────────────────────────────────────────

  type TlExtraStayOption {
    dateTimeLocal: String!
    price: Float!
    currency: String!
  }

  type TlExtraStays {
    earlyCheckIn: [TlExtraStayOption!]!
    lateCheckOut: [TlExtraStayOption!]!
  }

  input TlExtraStaysInput {
    arrivalDateTime: String!
    departureDateTime: String!
    roomTypeId: String!
    ratePlanId: String!
    roomTypePlacements: [String!]
    adults: Int
    childAges: [Int!]
    corporateId: String
  }

  # ─── Corporate clients ────────────────────────────────────────────────────────

  type TlCorporate {
    id: String!
    legalName: String!
    inn: String
    kpp: String
    raw: String!
  }

  input TlCreateCorporateInput {
    inn: String!
    kpp: String!
  }

  # ─── Raw proxy ───────────────────────────────────────────────────────────────

  type TlRawResponse {
    status: Int!
    body: String!
    ok: Boolean!
  }

  input TlRawRequestInput {
    method: String!
    path: String!
    body: String
  }

  # ─── Query / Mutation ──────────────────────────────────────────────────────

  extend type Query {
    tlConfig: TlConfig!
    tlCities(countryCode: String): [TlCity!]!
    tlPropertiesByCity(
      input: TlSearchPropertiesByCityInput!
    ): TlPropertiesResult!
    tlSearchProperties(filter: TlSearchPropertiesInput): TlPropertiesResult!
    tlProperty(id: ID!): TlProperty!
    tlRoomTypes(propertyId: ID!): [TlRoomType!]!
    tlRatePlans(propertyId: ID!): [TlRatePlan!]!
    tlAvailability(input: TlAvailabilityInput!): TlAvailabilityResult!
    tlPropertyCalendar(input: TlCalendarInput!): [TlCalendarCell!]!
    tlPropertiesAvailability(
      input: TlSearchDatesInput!
    ): [TlPropertyPriceSummary!]!
    tlReservations: [TlReservation!]!
    tlReservation(id: ID!): TlReservation!
    tlCancellationPenalty(bookingId: String!): TlCancellationPenalty!
    hotelOptionsForPlacement(city: String!): [HotelPlacementOption!]!
    tlSyncStatus: TlSyncStatus!
    tlLocalProperties(filter: TlSearchPropertiesInput): TlPropertiesResult!
    tlCorporate(id: ID!): TlCorporate!
    tlCorporates: [TlCorporate!]!
    tlExtraStays(propertyId: String!, input: TlExtraStaysInput!): TlExtraStays!
  }

  extend type Mutation {
    tlSetConfig(input: TlSetConfigInput!): Boolean!
    tlSyncCatalog(countryCode: String): TlSyncStatus!
    tlSetAutoSyncHours(hours: Int!): Int!
    tlCreateReservation(input: TlCreateReservationInput!): TlCreateReservationResult!
    tlCancelReservation(id: ID!): Boolean!
    tlVerifyBooking(input: TlVerifyInput!): TlVerifyResult!
    tlRawRequest(input: TlRawRequestInput!): TlRawResponse!
    tlCreateCorporate(input: TlCreateCorporateInput!): TlCorporate!
    tlAmendReservation(input: TlAmendReservationInput!): TlAmendResult!
  }
`

export default travellineTypeDef
