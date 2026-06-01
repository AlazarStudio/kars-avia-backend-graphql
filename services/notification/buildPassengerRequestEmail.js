import { prisma } from "../../prisma.js"
import {
  buildCancelPassengerRequestEmail,
  buildCreatePassengerRequestEmail,
  buildHotelChessPassengerRequestEmail,
  buildPassengerRequestActionEmail,
  buildPassengerRequestDatesChangeEmail,
  buildUpdatePassengerRequestEmail
} from "../email/passengerRequestEmailTemplates.js"

async function enrichCreateExtras(passengerRequest, emailExtras) {
  const extras = { ...emailExtras }
  if (!extras.airlineName && passengerRequest.airlineId) {
    const airline = await prisma.airline.findUnique({
      where: { id: passengerRequest.airlineId },
      select: { name: true }
    })
    extras.airlineName = airline?.name
  }
  if (!extras.airportName && passengerRequest.airportId) {
    const airport = await prisma.airport.findUnique({
      where: { id: passengerRequest.airportId },
      select: { name: true }
    })
    extras.airportName = airport?.name
  }
  return extras
}

export async function buildPassengerRequestEmail({
  emailAction,
  passengerRequest,
  description,
  fulldescription,
  cancelReason,
  emailExtras = {}
}) {
  const base = {
    requestNumber: passengerRequest.requestNumber,
    flightNumber: passengerRequest.flightNumber,
    requestId: passengerRequest.id
  }

  if (emailAction === "create_passenger_request") {
    const extras = await enrichCreateExtras(passengerRequest, emailExtras)
    return buildCreatePassengerRequestEmail({
      ...base,
      routeFrom: passengerRequest.routeFrom,
      routeTo: passengerRequest.routeTo,
      airportName: extras.airportName,
      airlineName: extras.airlineName
    })
  }

  if (emailAction === "passenger_request_dates_change") {
    return buildPassengerRequestDatesChangeEmail({
      ...base,
      oldFlightDate: emailExtras.oldFlightDate,
      newFlightDate: emailExtras.newFlightDate,
      airlineName: emailExtras.airlineName
    })
  }

  if (emailAction === "cancel_passenger_request") {
    return buildCancelPassengerRequestEmail({
      ...base,
      cancelReason: cancelReason ?? emailExtras.cancelReason
    })
  }

  if (emailAction === "update_hotel_chess_passenger_request") {
    return buildHotelChessPassengerRequestEmail({
      ...base,
      hotelName: emailExtras.hotelName,
      personName: emailExtras.personName,
      roomName: emailExtras.roomName,
      description: description || fulldescription
    })
  }

  if (emailAction === "update_passenger_request") {
    return buildUpdatePassengerRequestEmail({
      ...base,
      description: description || fulldescription
    })
  }

  return buildPassengerRequestActionEmail({
    ...base,
    description,
    fulldescription
  })
}
