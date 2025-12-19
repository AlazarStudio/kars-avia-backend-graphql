const driverTypeDef = /* GraphQL */ `
  #graphql
  scalar Date
  scalar Upload

  enum DriverRegistrationStatus {
    PENDING
    APPROVED
    REJECTED
  }

  #Пользовательский тип
  type DriverDocuments {
    driverPhoto: [String]
    carPhotos: [String]
    stsPhoto: [String]
    ptsPhoto: [String]
    osagoPhoto: [String]
    licensePhoto: [String]
  }

  #Пользовательский тип
  type GeoPoint {
    lat: Float
    lng: Float
    updatedAt: Date
  }
  input GeoPointInput {
    lat: Float
    lng: Float
    updatedAt: Date
  }

  type Driver {
    id: ID!
    createdAt: Date!
    updatedAt: Date!
    name: String!
    number: String
    email: String
    password: String!
    car: String
    vehicleNumber: String
    driverLicenseNumber: String
    driverLicenseIssueYear: Int
    extraEquipment: [String]
    organization: Organization
    organizationId: String
    organizationConfirmed: Boolean
    documents: DriverDocuments
    registrationStatus: DriverRegistrationStatus
    refusalReason: String
    location: GeoPoint
    rating: Float
    transfers: [Transfer]
    transferMessages: [TransferMessage]
    active: Boolean
    online: Boolean
    role: Role
    # TransferReview: [TransferReview]
    # TransferChat: [TransferChat]
    # TransferMessageRead: [TransferMessageRead]
  }

  # type DriverAuthPayload {
  #     id: ID
  #     name: String
  #     email: String
  #     token: String
  # }

  input DriverCreateInput {
    name: String!
    number: String!
    email: String!
    password: String!
    car: String
    vehicleNumber: String
    driverLicenseNumber: String
    driverLicenseIssueYear: Int
    extraEquipment: [String]
    organizationId: String
    # documents: DriverDocumentsUpdateInput
    registrationStatus: DriverRegistrationStatus
  }

  input DriverUpdateInput {
    name: String
    number: String
    email: String
    newPassword: String
    oldPassword: String
    car: String
    vehicleNumber: String
    driverLicenseNumber: String
    driverLicenseIssueYear: Int
    location: GeoPointInput
    rating: Float
    extraEquipment: [String]
    organizationId: String
    organizationConfirmed: Boolean
    # documents: DriverDocumentsUpdateInput
    registrationStatus: DriverRegistrationStatus
    refusalReason: String
    active: Boolean
    online: Boolean
  }

  input DriverDocumentsUpdateInput {
    carPhotos: [Upload]
    driverPhoto: [Upload]
    stsPhoto: [Upload]
    ptsPhoto: [Upload]
    osagoPhoto: [Upload]
    licensePhoto: [Upload]
  }

  type DriverConnection {
    totalPages: Int
    totalCount: Int
    drivers: [Driver]
  }

  input DriverPaginationInput {
    skip: Int
    take: Int
    all: Boolean
  }

  # input transferSignInput {
  #     email: String!
  #     password: String!
  # }

  type Query {
    drivers(pagination: DriverPaginationInput!): DriverConnection!
    driverById(id: ID!): Driver!
    driverByEmail(email: String!): Driver!
  }

  type Mutation {
    createDriver(
      input: DriverCreateInput!
      driverPhoto: [Upload]
      carPhotos: [Upload]
      stsPhoto: [Upload]
      ptsPhoto: [Upload]
      osagoPhoto: [Upload]
      licensePhoto: [Upload]
    ): Driver!
    updateDriver(
      id: ID!
      input: DriverUpdateInput
      driverPhoto: [Upload]
      carPhotos: [Upload]
      stsPhoto: [Upload]
      ptsPhoto: [Upload]
      osagoPhoto: [Upload]
      licensePhoto: [Upload]
    ): Driver!
    # transferSignIn(input: transferSignInput): DriverAuthPayload!
    updateDriverDocuments(id: ID!, input: DriverDocumentsUpdateInput!): Driver!
    deleteDriver(id: ID!): Driver!

    #Создать typeDef И resolvers для transferMessage
  }

  type Subscription {
    driverCreated: Driver!
    driverUpdated: Driver!
    driverOnline: Boolean
  }
`

export default driverTypeDef
