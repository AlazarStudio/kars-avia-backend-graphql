const dispatcherTypeDef = `#graphql
scalar Date

type Notification {
  id: ID!
  createdAt: Date!
  readBy: [NotificationRead]
  request: Request
  requestId: ID
  reserve: Reserve
  reserveId: ID
  hotel: Hotel
  hotelId: ID
  airline: Airline
  airlineId: ID
  chat: Chat
  chatId: ID
  message: Message
  messageId: ID
  description: NotificationDescription
}

type NotificationDescription {
  action: String
  reason: String
  description: String
}

type NotificationRead {
  id: ID
  notification: Notification
  user: User
  readAt: Date
}

input PaginationInput {
  skip: Int
  take: Int
  type: String
  status: [String]
}

type NotificationConnection {
  totalPages: Int
  totalCount: Int
  notifications: [Notification]
}

# union NotificationPayload = AirlineCreated | AirlineUpdated | MessageSent | HotelCreated | HotelUpdated | ReportCreated | RequestCreated | RequestUpdated | ReserveCreated | ReserveHotel | ReserveUpdated | ReservePersons | UserCreated | ExtendRequestNotification
union NotificationPayload =  ExtendRequestNotification | RequestCreatedNotification | ReserveCreatedNotification | ReserveUpdatedNotification | MessageSentNotification 

# type AirlineCreated {  }

# type AirlineUpdated {  }

type MessageSentNotification { 
  chat: Chat
  text: String
  reserveId: ID
  requestId: ID
 }

# type HotelCreated {  }

# type HotelUpdated {  }

# type ReportCreated {  }

type RequestCreatedNotification { 
  requestId: ID
  arrival: Date
  departure: Date
  airline: Airline
 }

# type RequestUpdated {  }

type ReserveCreatedNotification { 
  reserveId: ID
  arrival: Date
  departure: Date
  airline: Airline
 }

# type ReserveHotel {  }

type ReserveUpdatedNotification { 
  reserveId: ID
  arrival: Date
  departure: Date
  airline: Airline
 }

# type ReservePersons {  }

# type UserCreated {  }

type ExtendRequestNotification {
  requestId: ID
  newStart: Date
  newEnd: Date
  airline: Airline
}

type Query {
  # getAllNotifications: Notification
  getPosition(id:ID!): Position
  getAllPositions: [Position]
  getAirlinePositions: [Position]
  getAirlineUserPositions: [Position]
  getHotelPositions: [Position]
  getDispatcherPositions: [Position]
  getAllNotifications(pagination: PaginationInput): NotificationConnection!
}

type Mutation {
  createPosition(input: PositionInput): Position
  updatePosition(input: PositionInput): Position
  allDataUpdate: Boolean
}

type Subscription {
  notification: NotificationPayload!
}


`

export default dispatcherTypeDef
