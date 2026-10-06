// Кто видит размещённых в гостинице (Hotel.hotelChesses). Записи несут ПДн
// гостей (client, passenger) и чужие заявки, а hotels/hotel пускают любого
// вошедшего, поэтому выдача режется здесь (ПДН-Е-07).
//
// Принадлежность — тот же resolveScope, что у ФАП и у маскировки цен
// авиакомпаний (hideAirlinePrices.js): диспетчер видит всё, гостиница — только
// свою, пользователь CRM авиакомпании — свои заявки и резервы. Персонал АК
// (экипаж) получает скоуп airline тоже, но чужие размещения коллег ему не нужны.

import { resolveScope } from "../passengerRequest/fapScope.js"

// Фрагмент Prisma where для hotelChess. null — субъекту не положено ничего.
export function hotelChessScopeWhere(context, hotelId) {
  const scope = resolveScope(context)

  if (scope.kind === "all") return { hotelId }

  if (scope.kind === "hotel") {
    return scope.hotelId === hotelId ? { hotelId } : null
  }

  if (scope.kind === "airline" && context?.subjectType === "USER") {
    return {
      hotelId,
      OR: [
        { request: { is: { airlineId: scope.airlineId } } },
        { reserve: { is: { airlineId: scope.airlineId } } }
      ]
    }
  }

  return null
}
