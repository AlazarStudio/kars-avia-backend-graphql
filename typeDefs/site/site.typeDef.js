const siteTypeDef = /* GraphQL */ `
  #graphql

  scalar Date

  type MaintenanceBanner {
    enabled: Boolean!
    message: String
    endsAt: Date
    isVisible: Boolean!
  }

  input UpdateMaintenanceBannerInput {
    enabled: Boolean!
    message: String
    endsAt: Date
  }

  extend type Query {
    maintenanceBanner: MaintenanceBanner!
  }

  extend type Mutation {
    updateMaintenanceBanner(
      input: UpdateMaintenanceBannerInput!
    ): MaintenanceBanner!
  }

  type Subscription {
    maintenanceBannerUpdated: MaintenanceBanner!
  }
`

export default siteTypeDef
