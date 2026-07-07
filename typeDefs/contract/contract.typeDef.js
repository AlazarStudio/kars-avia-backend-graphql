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
    contractEndDate: SortOrder
    contractNumber: SortOrder
    createdAt: SortOrder
  }

  input HotelContractOrderByInput {
    date: SortOrder
    contractEndDate: SortOrder
    contractNumber: SortOrder
    createdAt: SortOrder
  }

  input OrganizationContractOrderByInput {
    date: SortOrder
    contractEndDate: SortOrder
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
    archived: Boolean
  }

  input HotelContractFilter {
    companyId: ID
    hotelId: ID
    cityId: ID
    dateFrom: Date
    dateTo: Date
    search: String
    archived: Boolean
  }

  input OrganizationContractFilter {
    companyId: ID
    organizationId: ID
    cityId: ID
    dateFrom: Date
    dateTo: Date
    search: String
    archived: Boolean
  }

  input AdditionalAgreementFilter {
    airlineContractId: ID
    hotelContractId: ID
    organizationContractId: ID
    archived: Boolean
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

  type ContractFile {
    name: String!
    url: String!
  }

  type AdditionalAgreement {
    id: ID!
    airlineContractId: ID
    airlineContract: AirlineContract
    hotelContractId: ID
    hotelContract: HotelContract
    organizationContractId: ID
    organizationContract: OrganizationContract
    date: Date
    agreementEndDate: Date
    isProlongationEnabled: Boolean!
    daysUntilEnd: Int
    isExpiringSoon: Boolean!
    isExpired: Boolean!
    expirationPriority: Int!
    isArchived: Boolean!
    archivedAt: Date
    archivedById: ID
    contractNumber: String
    itemAgreement: String
    notes: String
    files: [ContractFile!]!
  }

  type AirlineContract {
    id: ID!
    companyId: ID
    company: Company
    airlineId: ID
    airline: Airline
    date: Date
    contractEndDate: Date
    isProlongationEnabled: Boolean!
    daysUntilEnd: Int
    isExpiringSoon: Boolean!
    isExpired: Boolean!
    expirationPriority: Int!
    isArchived: Boolean!
    archivedAt: Date
    archivedById: ID
    contractNumber: String
    region: String
    applicationType: String
    notes: String
    files: [ContractFile!]!
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
    contractEndDate: Date
    isProlongationEnabled: Boolean!
    daysUntilEnd: Int
    isExpiringSoon: Boolean!
    isExpired: Boolean!
    expirationPriority: Int!
    isArchived: Boolean!
    archivedAt: Date
    archivedById: ID
    contractNumber: String
    notes: String
    legalEntity: String
    signatureMark: String
    completionMark: String
    normativeAct: String
    applicationType: String
    executor: String
    files: [ContractFile!]!
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
    contractEndDate: Date
    isProlongationEnabled: Boolean!
    daysUntilEnd: Int
    isExpiringSoon: Boolean!
    isExpired: Boolean!
    expirationPriority: Int!
    isArchived: Boolean!
    archivedAt: Date
    archivedById: ID
    contractNumber: String
    notes: String
    # legalEntity: String
    # signatureMark: String
    # completionMark: String
    # normativeAct: String
    applicationType: String
    # executor: String
    files: [ContractFile!]!
    additionalAgreements: [AdditionalAgreement!]!
  }

  #  ===== INPUTS =====

  input AdditionalAgreementInput {
    airlineContractId: ID
    hotelContractId: ID
    organizationContractId: ID
    date: Date
    agreementEndDate: Date
    isProlongationEnabled: Boolean
    contractNumber: String
    itemAgreement: String
    notes: String
    files: [Upload!]
  }

  input AirlineContractCreateInput {
    companyId: ID
    airlineId: ID
    date: Date
    contractEndDate: Date
    isProlongationEnabled: Boolean
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
    contractEndDate: Date
    isProlongationEnabled: Boolean
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
    contractEndDate: Date
    isProlongationEnabled: Boolean
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
    contractEndDate: Date
    isProlongationEnabled: Boolean
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
    contractEndDate: Date
    isProlongationEnabled: Boolean
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
    contractEndDate: Date
    isProlongationEnabled: Boolean
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

    additionalAgreements(
      airlineContractId: ID
      filter: AdditionalAgreementFilter
    ): [AdditionalAgreement!]!
  }

  # Mutation
  type Mutation {
    createAirlineContract(
      input: AirlineContractCreateInput!
      files: [Upload!]
      fileNames: [String!]
    ): AirlineContract!
    updateAirlineContract(
      id: ID!
      input: AirlineContractUpdateInput!
      files: [Upload!]
      fileNames: [String!]
    ): AirlineContract!
    deleteAirlineContract(id: ID!): Boolean!
    removeAirlineContractFile(
      contractId: ID!
      fileUrl: String!
    ): AirlineContract!
    archiveAirlineContract(id: ID!): AirlineContract!
    restoreAirlineContract(id: ID!): AirlineContract!

    createAdditionalAgreement(
      input: AdditionalAgreementInput!
      files: [Upload!]
      fileNames: [String!]
    ): AdditionalAgreement!
    updateAdditionalAgreement(
      id: ID!
      input: AdditionalAgreementInput!
      files: [Upload!]
      fileNames: [String!]
    ): AdditionalAgreement!
    deleteAdditionalAgreement(id: ID!): Boolean!
    removeAdditionalAgreementFile(
      agreementId: ID!
      fileUrl: String!
    ): AdditionalAgreement!
    archiveAdditionalAgreement(id: ID!): AdditionalAgreement!
    restoreAdditionalAgreement(id: ID!): AdditionalAgreement!

    createHotelContract(
      input: HotelContractCreateInput!
      files: [Upload!]
      fileNames: [String!]
    ): HotelContract!
    updateHotelContract(
      id: ID!
      input: HotelContractUpdateInput!
      files: [Upload!]
      fileNames: [String!]
    ): HotelContract!
    deleteHotelContract(id: ID!): Boolean!
    removeHotelContractFile(
      contractId: ID!
      fileUrl: String!
    ): HotelContract!
    archiveHotelContract(id: ID!): HotelContract!
    restoreHotelContract(id: ID!): HotelContract!

    createOrganizationContract(
      input: OrganizationContractCreateInput!
      files: [Upload!]
      fileNames: [String!]
    ): OrganizationContract!
    updateOrganizationContract(
      id: ID!
      input: OrganizationContractUpdateInput!
      files: [Upload!]
      fileNames: [String!]
    ): OrganizationContract!
    deleteOrganizationContract(id: ID!): Boolean!
    removeOrganizationContractFile(
      contractId: ID!
      fileUrl: String!
    ): OrganizationContract!
    archiveOrganizationContract(id: ID!): OrganizationContract!
    restoreOrganizationContract(id: ID!): OrganizationContract!
  }

  type Subscription {
    contractAirline: AirlineContract!
    contractHotel: HotelContract!
    contractOrganization: OrganizationContract!
  }
`

export default contractTypeDef
