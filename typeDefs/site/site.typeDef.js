const siteTypeDef = /* GraphQL */ `
  #graphql

  type MaintenanceBanner {
    enabled: Boolean!
    message: String
    endsAt: DateTime
    isVisible: Boolean!
  }

  input UpdateMaintenanceBannerInput {
    enabled: Boolean!
    message: String
    endsAt: DateTime
  }

  extend type Query {
    maintenanceBanner: MaintenanceBanner!
  }

  extend type Mutation {
    updateMaintenanceBanner(
      input: UpdateMaintenanceBannerInput!
    ): MaintenanceBanner!
  }
`

export default siteTypeDef
