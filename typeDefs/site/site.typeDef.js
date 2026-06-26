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

  type SystemUpdate {
    version: String
    title: String
    message: String
    enabled: Boolean!
    publishedAt: Date
    shouldShow: Boolean!
  }

  input UpdateSystemUpdateInput {
    version: String!
    title: String!
    message: String!
    enabled: Boolean!
    publishedAt: Date
  }

  extend type Query {
    maintenanceBanner: MaintenanceBanner!
    systemUpdate: SystemUpdate!
  }

  extend type Mutation {
    updateMaintenanceBanner(
      input: UpdateMaintenanceBannerInput!
    ): MaintenanceBanner!
    updateSystemUpdate(input: UpdateSystemUpdateInput!): SystemUpdate!
    markSystemUpdateSeen: SystemUpdate!
  }

  type Subscription {
    maintenanceBannerUpdated: MaintenanceBanner!
    systemUpdatePublished: SystemUpdate!
  }
`

export default siteTypeDef
