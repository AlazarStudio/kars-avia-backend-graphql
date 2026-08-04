// Предметные хелперы услуги «Проживание»: обход гостиниц, пересчёт статуса
// услуги и два блока, которые повторялись дословно в мутациях заселения.
//
// Всё здесь — перенос из living.resolver.js без правок. Ни порог перебора, ни
// скрытая нормализация чужих гостиниц, ни try/catch вокруг уведомления не
// «поправлены»: каждое из этих поведений наблюдаемо и закреплено
// характеризационными тестами группы «Проживание».

import { GraphQLError } from "graphql"
import { ensureHotelPerson } from "./normalizers.js"
import { notifyPassengerRequestSite } from "./notify.js"
import { recomputeServiceStatus } from "./serviceStatus.js"

// Факт услуги проживания — люди ВСЕХ гостиниц сразу: движок статусов знает
// только общий счёт по услуге, вместимость отдельной гостиницы ему не видна.
export const countLivingPeople = (hotels) =>
  (hotels || []).reduce(
    (sum, h) => sum + (Array.isArray(h.people) ? h.people.length : 0),
    0
  )

// Обход гостиниц услуги при правке ОДНОЙ из них.
//
// ⚠️ Скрытая миграция данных: через ensureHotelPerson прогоняются люди ВСЕХ
// гостиниц, а не только затронутой. Мутация об этом нигде не сообщает, но
// результат наблюдаем и закреплён тестом «СКРЫТАЯ МИГРАЦИЯ» — сузить обход до
// целевой гостиницы значило бы изменить поведение, а не почистить код.
//
// Имя гостиницы уходит в нормализатор как `hotel?.name ?? ""`. Вхождения в
// резолвере писали то `h.name`, то `h?.name ?? ""`; разница неразличима —
// ensureAccommodationChesses сводит и "", и undefined к одному и тому же null.
//
// makeTargetPeople(hotel, index, people) получает СЫРУЮ гостиницу и уже
// нормализованный список её людей. Оба аргумента нужны: часть вхождений строит
// новый состав из нормализованных людей, а правка одного гостя — из сырых
// (остальных людей своей гостиницы она не трогает вовсе).
export function withHotelPeople(hotels, hotelIndex, makeTargetPeople) {
  return (hotels || []).map((hotel, index) => {
    const people = (hotel?.people || []).map((item) =>
      ensureHotelPerson(item, index, hotel?.name ?? "")
    )
    if (index !== hotelIndex) return { ...hotel, people }
    return { ...hotel, people: makeTargetPeople(hotel, index, people) }
  })
}

// Статус услуги после изменения состава. «До» и «после» обязаны считаться одной
// и той же функцией: разъехавшись, они дают статус, не соответствующий факту.
export const applyServiceRecalc = (living, hotelsBefore, hotelsAfter) =>
  recomputeServiceStatus(
    living,
    countLivingPeople(hotelsBefore),
    countLivingPeople(hotelsAfter)
  )

// Гейт «внешний пользователь гостиницы заселяет только к себе».
//
// ⚠️ Стоит ровно у двух add-мутаций. У остальных шести мутаций проживания его
// нет, и это закреплено тестом «гейт по scope ОТСУТСТВУЕТ у пяти мутаций»:
// раздать гейт всем — работа по авторизации, а не рефактор.
export function assertHotelScopeAccess(context, hotels, hotelIndex) {
  if (
    context.subjectType === "EXTERNAL_USER" &&
    context.subject?.scope === "HOTEL" &&
    context.subject?.hotelId
  ) {
    const targetHotel = hotels[hotelIndex]
    if (!targetHotel || targetHotel.hotelId !== context.subject.hotelId) {
      throw new GraphQLError(
        "Access forbidden: you can only add bookings to your hotel.",
        { extensions: { code: "FORBIDDEN" } }
      )
    }
  }
}

// Сайтовое уведомление о переселении сверх заказанных мест.
//
// Уведомляем ТОЛЬКО при переходе через порог, иначе каждый следующий гость сверх
// заявки плодит новую запись. Порог — placedBefore <= capacity && placedAfter >
// capacity: при вместимости 2 уведомление даёт ТРЕТИЙ гость, а не второй.
// capacity === 0 означает «вместимость не задана» и молчит вовсе.
//
// Уведомление не должно ронять уже совершённое добавление: гости записаны,
// и ошибка на этом шаге заставила бы оператора отсканировать их повторно.
export async function notifyHotelOverbookIfCrossed({
  passengerRequest,
  hotel,
  capacity,
  placedBefore,
  placedAfter,
  requestId,
  hotelIndex
}) {
  if (!(capacity > 0 && placedBefore <= capacity && placedAfter > capacity)) {
    return
  }
  try {
    await notifyPassengerRequestSite({
      action: "passenger_request_hotel_overbooked",
      passengerRequestId: passengerRequest.id,
      airlineId: passengerRequest.airlineId,
      hotelId: hotel.hotelId || undefined,
      descriptionHtml: `В ФАП <span style='color:#545873'>${passengerRequest.flightNumber}</span> в гостинице <span style='color:#545873'>${hotel.name || "без названия"}</span> заселено <span style='color:#545873'>${placedAfter}</span> при <span style='color:#545873'>${capacity}</span> местах по заявке`,
      __typename: "PassengerRequestUpdatedNotification"
    })
  } catch (error) {
    console.error(`Ошибка уведомления об overbooked ФАП (requestId=${requestId}, hotelIndex=${hotelIndex}):`, error)
  }
}
