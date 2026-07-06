// Гидрация заявки ФАП: ростер savedPassengers — источник истины идентичности.
// Накладываем идентичность на каждую сервис-персону по personId; placement не трогаем.
// Ростер «побеждает при чтении», но не затирает своими null-ами (?? — берём ростер, только если задан).

const overlayIdentity = (person, byId) => {
  const id = person?.personId
  if (!id) return person
  const src = byId.get(id)
  if (!src) return person
  return {
    ...person,
    fullName: src.fullName ?? person.fullName,
    phone: src.phone ?? person.phone ?? null,
    seat: src.seat ?? person.seat ?? null,
    personType: src.personType ?? person.personType,
    personCategory: src.personCategory ?? person.personCategory,
    airlinePersonalId: src.airlinePersonalId ?? person.airlinePersonalId ?? null
  }
}

const hydrateDriverService = (service, byId) => {
  if (!service?.drivers?.length) return service
  return {
    ...service,
    drivers: service.drivers.map((d) => ({
      ...d,
      people: (d.people || []).map((p) => overlayIdentity(p, byId))
    }))
  }
}

export const hydratePassengerRequest = (request) => {
  if (!request) return request
  const roster = Array.isArray(request.savedPassengers)
    ? request.savedPassengers
    : []
  if (roster.length === 0) return request

  const byId = new Map()
  for (const p of roster) {
    if (p?.personId) byId.set(p.personId, p)
  }

  const next = { ...request }

  if (request.waterService?.people?.length) {
    next.waterService = {
      ...request.waterService,
      people: request.waterService.people.map((p) => overlayIdentity(p, byId))
    }
  }
  if (request.mealService?.people?.length) {
    next.mealService = {
      ...request.mealService,
      people: request.mealService.people.map((p) => overlayIdentity(p, byId))
    }
  }
  if (request.livingService?.hotels?.length) {
    next.livingService = {
      ...request.livingService,
      hotels: request.livingService.hotels.map((h) => ({
        ...h,
        people: (h.people || []).map((p) => overlayIdentity(p, byId))
      }))
    }
  }
  if (request.transferService) {
    next.transferService = hydrateDriverService(request.transferService, byId)
  }
  if (request.departureTransferService) {
    next.departureTransferService = hydrateDriverService(
      request.departureTransferService,
      byId
    )
  }
  if (request.intercityTransferService) {
    next.intercityTransferService = hydrateDriverService(
      request.intercityTransferService,
      byId
    )
  }
  if (request.baggageDeliveryService) {
    next.baggageDeliveryService = hydrateDriverService(
      request.baggageDeliveryService,
      byId
    )
  }

  return next
}
