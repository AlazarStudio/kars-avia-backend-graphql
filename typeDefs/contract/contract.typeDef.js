const contractTypeDef = /* GraphQL */ `
  #graphql
  scalar Date
  scalar Upload

  input ContractPaginationInput {
    skip: Int
    take: Int
    all: Boolean
  }

  enum SortOrder {
    asc
    desc
  }

  input AirlineContractOrderByInput {
    date: SortOrder
    contractNumber: SortOrder
    createdAt: SortOrder
  }

  input HotelContractOrderByInput {
    date: SortOrder
    contractNumber: SortOrder
    createdAt: SortOrder
  }

  input OrganizationContractOrderByInput {
    date: SortOrder
    contractNumber: SortOrder
    createdAt: SortOrder
  }

  input AirlineContractFilter {
    companyId: ID
    airlineId: ID
    dateFrom: Date
    dateTo: Date
    applicationType: String
    search: String
  }

  input HotelContractFilter {
    companyId: ID
    hotelId: ID
    cityId: ID
    dateFrom: Date
    dateTo: Date
    search: String
  }

  input OrganizationContractFilter {
    companyId: ID
    organizationId: ID
    # cityId: ID
    dateFrom: Date
    dateTo: Date
    search: String
  }

  type AirlineContractConnection {
    items: [AirlineContract!]!
    totalCount: Int!
    totalPages: Int
  }

  type HotelContractConnection {
    items: [HotelContract!]!
    totalCount: Int!
    totalPages: Int
  }

  type OrganizationContractConnection {
    items: [OrganizationContract!]!
    totalCount: Int!
    totalPages: Int
  }

  #  ===== DOMAIN TYPES =====

  type AdditionalAgreement {
    id: ID!
    airlineContractId: ID
    airlineContract: AirlineContract
    hotelContractId: ID
    hotelContract: HotelContract
    organizationContractId: ID
    organizationContract: OrganizationContract
    date: Date
    contractNumber: String
    itemAgreement: String
    notes: String
    files: [String!]!
  }

  type AirlineContract {
    id: ID!
    companyId: ID
    company: Company
    airlineId: ID
    airline: Airline
    date: Date
    contractNumber: String
    region: String
    applicationType: String
    notes: String
    files: [String!]!
    additionalAgreements: [AdditionalAgreement!]!
  }

  type HotelContract {
    id: ID!
    companyId: ID
    company: Company
    hotelId: ID
    hotel: Hotel
    cityId: ID
    region: City!
    date: Date
    contractNumber: String
    notes: String
    legalEntity: String
    signatureMark: String
    completionMark: String
    normativeAct: String
    applicationType: String
    executor: String
    files: [String!]!
    additionalAgreements: [AdditionalAgreement!]!
  }

  type OrganizationContract {
    id: ID!
    companyId: ID
    company: Company
    organizationId: ID
    organization: Organization
    cityId: ID
    region: City!
    date: Date
    contractNumber: String
    notes: String
    # legalEntity: String
    # signatureMark: String
    # completionMark: String
    # normativeAct: String
    applicationType: String
    # executor: String
    files: [String!]!
    additionalAgreements: [AdditionalAgreement!]!
  }

  #  ===== INPUTS =====

  input AdditionalAgreementInput {
    airlineContractId: ID
    hotelContractId: ID
    organizationContractId: ID
    date: Date
    contractNumber: String
    itemAgreement: String
    notes: String
    files: [Upload!]
  }

  input AirlineContractCreateInput {
    companyId: ID
    airlineId: ID
    date: Date
    contractNumber: String
    region: String
    applicationType: String
    notes: String
    files: [Upload!]
  }

  input AirlineContractUpdateInput {
    companyId: ID
    airlineId: ID
    date: Date
    contractNumber: String
    region: String
    applicationType: String
    notes: String
    files: [Upload!]
  }

  input HotelContractCreateInput {
    companyId: ID
    hotelId: ID
    cityId: ID
    date: Date
    contractNumber: String
    notes: String
    legalEntity: String
    signatureMark: String
    completionMark: String
    normativeAct: String
    applicationType: String
    executor: String
    files: [Upload!]
  }

  input HotelContractUpdateInput {
    companyId: ID
    hotelId: ID
    cityId: ID
    date: Date
    contractNumber: String
    notes: String
    legalEntity: String
    signatureMark: String
    completionMark: String
    normativeAct: String
    applicationType: String
    executor: String
    files: [Upload!]
  }

  input OrganizationContractCreateInput {
    companyId: ID
    organizationId: ID
    cityId: ID
    date: Date
    contractNumber: String
    notes: String
    # legalEntity: String
    # signatureMark: String
    # completionMark: String
    # normativeAct: String
    applicationType: String
    # executor: String
    files: [Upload!]
  }

  input OrganizationContractUpdateInput {
    companyId: ID
    organizationId: ID
    cityId: ID
    date: Date
    contractNumber: String
    notes: String
    # legalEntity: String
    # signatureMark: String
    # completionMark: String
    # normativeAct: String
    applicationType: String
    # executor: String
    files: [Upload!]
  }

  #  ===== ROOT =====

  type Query {
    airlineContracts(
      pagination: ContractPaginationInput
      filter: AirlineContractFilter
      orderBy: AirlineContractOrderByInput
    ): AirlineContractConnection!

    airlineContract(id: ID!): AirlineContract

    hotelContracts(
      pagination: ContractPaginationInput
      filter: HotelContractFilter
      orderBy: HotelContractOrderByInput
    ): HotelContractConnection!

    hotelContract(id: ID!): HotelContract

    organizationContracts(
      pagination: ContractPaginationInput
      filter: OrganizationContractFilter
      orderBy: OrganizationContractOrderByInput
    ): OrganizationContractConnection!

    organizationContract(id: ID!): OrganizationContract

    additionalAgreements(airlineContractId: ID): [AdditionalAgreement!]!
  }

  type Mutation {
    createAirlineContract(
      input: AirlineContractCreateInput!
      files: [Upload!]
    ): AirlineContract!
    updateAirlineContract(
      id: ID!
      input: AirlineContractUpdateInput!
      files: [Upload!]
    ): AirlineContract!
    deleteAirlineContract(id: ID!): Boolean!

    createAdditionalAgreement(
      input: AdditionalAgreementInput!
      files: [Upload!]
    ): AdditionalAgreement!
    updateAdditionalAgreement(
      id: ID!
      input: AdditionalAgreementInput!
      files: [Upload!]
    ): AdditionalAgreement!
    deleteAdditionalAgreement(id: ID!): Boolean!

    createHotelContract(
      input: HotelContractCreateInput!
      files: [Upload!]
    ): HotelContract!
    updateHotelContract(
      id: ID!
      input: HotelContractUpdateInput!
      files: [Upload!]
    ): HotelContract!
    deleteHotelContract(id: ID!): Boolean!

    createOrganizationContract(
      input: OrganizationContractCreateInput!
      files: [Upload!]
    ): OrganizationContract!
    updateOrganizationContract(
      id: ID!
      input: OrganizationContractUpdateInput!
      files: [Upload!]
    ): OrganizationContract!
    deleteOrganizationContract(id: ID!): Boolean!
  }

  type Subscription {
    contractAirline: AirlineContract!
    contractHotel: HotelContract!
    contractOrganization: OrganizationContract!
  }
`

export default contractTypeDef
