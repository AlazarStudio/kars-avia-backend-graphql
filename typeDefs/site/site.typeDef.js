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

  enum SystemUpdateAudience {
    AIRLINE
    DISPATCHER
    HOTEL
  }

  type SystemUpdateChangeItem {
    title: String!
    description: String
  }

  type SystemUpdateSection {
    new: [SystemUpdateChangeItem!]!
    updates: [SystemUpdateChangeItem!]!
    fixes: [SystemUpdateChangeItem!]!
  }

  type SystemUpdateAudienceBlock {
    audience: SystemUpdateAudience!
    sections: SystemUpdateSection!
  }

  type SystemUpdate {
    version: String
    title: String
    enabled: Boolean!
    publishedAt: Date
    shouldShow: Boolean!
    audiences: [SystemUpdateAudienceBlock!]!
  }

  input SystemUpdateChangeItemInput {
    title: String!
    description: String
  }

  input SystemUpdateSectionInput {
    new: [SystemUpdateChangeItemInput!]!
    updates: [SystemUpdateChangeItemInput!]!
    fixes: [SystemUpdateChangeItemInput!]!
  }

  input SystemUpdateAudienceInput {
    audience: SystemUpdateAudience!
    sections: SystemUpdateSectionInput!
  }

  input UpdateSystemUpdateInput {
    version: String!
    title: String!
    enabled: Boolean!
    publishedAt: Date
    audiences: [SystemUpdateAudienceInput!]!
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
