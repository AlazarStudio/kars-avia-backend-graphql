const dispatcherTypeDef = `#graphql
scalar Date

# union NotificationPayload = AirlineCreated | AirlineUpdated | MessageSent | HotelCreated | HotelUpdated | ReportCreated | RequestCreated | RequestUpdated | ReserveCreated | ReserveHotel | ReserveUpdated | ReservePersons | UserCreated | ExtendRequestNotification
union NotificationPayload =  ExtendRequestNotification | RequestCreatedNotification | ReserveCreatedNotification | ReserveUpdatedNotification

# type AirlineCreated {  }

# type AirlineUpdated {  }

# type MessageSent {  }

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

type Subscription {
  notification: NotificationPayload!
}


`

export default dispatcherTypeDef
