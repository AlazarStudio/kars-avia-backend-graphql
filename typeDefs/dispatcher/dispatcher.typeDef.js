const dispatcherTypeDef = `#graphql
scalar Date

# union NotificationPayload = AirlineCreated | AirlineUpdated | MessageSent | HotelCreated | HotelUpdated | ReportCreated | RequestCreated | RequestUpdated | ReserveCreated | ReserveHotel | ReserveUpdated | ReservePersons | UserCreated | ExtendRequestNotification
union NotificationPayload =  ExtendRequestNotification

# type AirlineCreated { }

# type AirlineUpdated { }

# type MessageSent { }

# type HotelCreated { }

# type HotelUpdated { }

# type ReportCreated { }

# type RequestCreated { }

# type RequestUpdated { }

# type ReserveCreated { }

# type ReserveHotel { }

# type ReserveUpdated { }

# type ReservePersons { }

# type UserCreated { }

type ExtendRequestNotification {
  requestId: ID!
  newStart: Date
  newEnd: Date
  dispatcherId: ID
}

type Subscription {
  notification: NotificationPayload!
}


`

export default dispatcherTypeDef
