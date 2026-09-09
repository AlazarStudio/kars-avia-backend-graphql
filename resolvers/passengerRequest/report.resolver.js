// Отчёт гостиницы по проживанию: сохранение, отправка, скрытие, согласование
// цен диспетчером и утверждение авиакомпанией.

import { prisma } from "../../prisma.js"
import { GraphQLError } from "graphql"
import { makeRoomCategoryLabel } from "../../services/passengerRequest/normalizers.js"
import {
  assertIndex,
  finishPassengerRequestMutation,
  getSubjectName,
  loadRequestOrThrow,
  reportWhere
} from "../../services/passengerRequest/envelope.js"
import {
  reportRowDate,
  reportRowsEqual
} from "../../services/passengerRequest/hotelReportRows.js"
import { assertCanAccessRequest } from "../../services/passengerRequest/fapScopeGuard.js"
import { assertHotelScopeAccess } from "../../services/passengerRequest/livingHelpers.js"
import { resolveScope } from "../../services/passengerRequest/fapScope.js"

// Утверждение отчёта — подпись авиакомпании под тем, что она увидела. Диспетчер
// и гостиница сюда не допускаются НЕ из соображений изоляции (заявка им и так
// видна), а потому что подпись за другую сторону обесценивает саму отметку.
// Предикат тот же, что у видимости цен в fields.resolver.js: resolveScope знает
// все типы субъекта ФАП, включая персонал авиакомпании без своего `user`.
const assertAirlineSubject = (context) => {
  if (resolveScope(context).kind === "airline") return
  throw new GraphQLError(
    "Утвердить отчёт может только авиакомпания",
    { extensions: { code: "FORBIDDEN", http: { status: 403 } } }
  )
}

export default {
  Mutation: {
    savePassengerRequestHotelReport: async (
      _,
      { requestId, hotelIndex, reportRows },
      context
    ) => {
      const existing = await loadRequestOrThrow(requestId)
      assertCanAccessRequest(context, existing)
      // Индекс приходит из URL страницы отчёта и на фронте не проверяется. Без
      // этой строки запись отчёта создавалась для несуществующей гостиницы:
      // составной ключ принимал любое число, а в тексте истории гостиница
      // вырождалась в «без названия». Соседние мутации проживания проверяют
      // индекс именно так.
      assertIndex(hotelIndex, existing.livingService?.hotels?.length ?? 0, "hotelIndex")
      // Отчёт — деньги конкретной гостиницы. Проверка уровня заявки пускает
      // сюда любую гостиницу-участницу, поэтому строку отчёта соседа
      // закрываем отдельно, по индексу.
      assertHotelScopeAccess(
        context,
        existing.livingService?.hotels || [],
        hotelIndex
      )

      const rows = reportRows.map((row) => ({
        fullName: row.fullName ?? "",
        personId: row.personId ?? "",
        roomNumber: row.roomNumber ?? "",
        roomCategory: makeRoomCategoryLabel(row.roomCategory, row.roomKind),
        roomKind: row.roomKind ?? "",
        arrival: reportRowDate(row.arrival, "arrival"),
        departure: reportRowDate(row.departure, "departure"),
        daysCount: row.daysCount ?? 0,
        breakfast: row.breakfast ?? 0,
        lunch: row.lunch ?? 0,
        dinner: row.dinner ?? 0,
        breakfastCount: row.breakfastCount ?? null,
        lunchCount: row.lunchCount ?? null,
        dinnerCount: row.dinnerCount ?? null,
        breakfastLunchbox: row.breakfastLunchbox ?? false,
        lunchLunchbox: row.lunchLunchbox ?? false,
        dinnerLunchbox: row.dinnerLunchbox ?? false,
        lunchboxPrice: row.lunchboxPrice ?? 0,
        lunchboxCount: row.lunchboxCount ?? null,
        foodCost: row.foodCost ?? 0,
        accommodationCost: row.accommodationCost ?? 0,
        tariffName: row.tariffName ?? "",
        pricePerDay: row.pricePerDay ?? 0,
        placementKind: row.placementKind ?? 0,
        accommodationDiscount: row.accommodationDiscount ?? null,
        placementKindOverride: row.placementKindOverride ?? null
      }))

      // Флаги отправки, согласования цен и утверждения авиакомпанией сбрасываем
      // ТОЛЬКО если строки реально изменились: автосейв дёргается ещё и флашем на
      // размонтировании страницы и перед выгрузкой Excel, и без этой проверки
      // флаги слетали бы от простого захода в отчёт.
      const prev = await prisma.passengerRequestHotelReport.findUnique({
        where: reportWhere(requestId, hotelIndex)
      })
      const rowsChanged = !reportRowsEqual(rows, prev?.reportRows)

      const report = await prisma.passengerRequestHotelReport.upsert({
        where: reportWhere(requestId, hotelIndex),
        create: {
          passengerRequestId: requestId,
          hotelIndex,
          reportRows: rows
        },
        update: {
          reportRows: rows,
          ...(rowsChanged && {
            submittedAt: null,
            pricingApprovedAt: null,
            airlineApprovedAt: null
          })
        }
      })

      // Уведомляем подписчиков: другие открытые клиенты перечитают заявку и
      // увидят обновлённый отчёт/тарифы (раньше сейв отчёта событие не публиковал).
      await finishPassengerRequestMutation({
        context,
        newData: report,
        publishData: existing,
        log: {
          action: "save_passenger_request_hotel_report",
          description: "Отчёт по гостинице ФАП сохранён",
          fulldescription: `Пользователь ${getSubjectName(context)} сохранил отчёт по гостинице ${existing.livingService?.hotels?.[hotelIndex]?.name || "без названия"} для ФАП ${existing.flightNumber}`,
          airlineId: existing.airlineId,
          passengerRequestId: requestId,
          // Автосохранение отчёта дёргается флашем при уходе со страницы и перед
          // выгрузкой Excel, то есть многократно за один сеанс работы. Своего
          // почтового действия у этого слага нет — resolveEmailActionForLog
          // отдаёт общее «update_passenger_request», поэтому каждый заход в
          // отчёт рассылал участникам письмо «заявка обновлена». Осмысленное
          // событие здесь — submit («отправлен на проверку»), он письмо и шлёт.
          skipEmail: true
        }
      })

      return report
    },

    submitPassengerRequestHotelReport: async (
      _,
      { requestId, hotelIndex },
      context
    ) => {
      const existing = await loadRequestOrThrow(requestId)
      assertCanAccessRequest(context, existing)
      // Своя строка отчёта — как у save. Отдельного assertIndex у отправки нет
      // (несуществующий индекс упирается в «Отчёт ещё не сохранён»), но для
      // гостиничного субъекта проверка индекса сама по себе даёт отказ.
      assertHotelScopeAccess(
        context,
        existing.livingService?.hotels || [],
        hotelIndex
      )
      const hotel = existing.livingService?.hotels?.[hotelIndex]

      const report = await prisma.passengerRequestHotelReport.findUnique({
        where: reportWhere(requestId, hotelIndex)
      })
      if (!report) throw new GraphQLError("Отчёт ещё не сохранён")

      const updated = await prisma.passengerRequestHotelReport.update({
        where: { id: report.id },
        data: { submittedAt: new Date() }
      })

      // Публикуем событие по заявке: у авиакомпании открытая страница сделает refetch
      // и отчёт появится без перезагрузки.
      await finishPassengerRequestMutation({
        context,
        // В журнал заявки уходит ЗАЯВКА, а не запись отчёта. Раньше здесь был
        // отчёт, и это давало две беды: summarizePassengerRequest в logaction
        // получал чужой документ и выдавал сводку из одних null, а почтовая
        // ветка брала passengerRequest = newData и искала заявку по
        // идентификатору ОТЧЁТА. Сама запись отчёта возвращается мутацией и
        // доступна через hotelReport, терять её незачем.
        newData: existing,
        log: {
          action: "submit_passenger_request_hotel_report",
          description: "Отчёт по гостинице ФАП отправлен на проверку",
          fulldescription: `Пользователь ${getSubjectName(context)} отправил отчёт по гостинице ${hotel?.name || "без названия"} на проверку в ФАП ${existing.flightNumber}`,
          airlineId: existing.airlineId,
          passengerRequestId: requestId
        },
        notify: {
          action: "submit_passenger_request_hotel_report",
          passengerRequestId: existing.id,
          airlineId: existing.airlineId,
          hotelId: hotel?.hotelId || undefined,
          descriptionHtml: `В ФАП <span style='color:#545873'>${existing.flightNumber}</span> отчёт по гостинице <span style='color:#545873'>${hotel?.name ?? "без названия"}</span> отправлен на проверку`,
          __typename: "PassengerRequestUpdatedNotification"
        }
      })

      return updated
    },

    hidePassengerRequestHotelReport: async (
      _,
      { requestId, hotelIndex },
      context
    ) => {
      const existing = await loadRequestOrThrow(requestId)
      assertCanAccessRequest(context, existing)
      // Своя строка отчёта — как у save и submit.
      assertHotelScopeAccess(
        context,
        existing.livingService?.hotels || [],
        hotelIndex
      )

      const report = await prisma.passengerRequestHotelReport.findUnique({
        where: reportWhere(requestId, hotelIndex)
      })
      if (!report) throw new GraphQLError("Отчёт ещё не сохранён")

      const updated = await prisma.passengerRequestHotelReport.update({
        where: { id: report.id },
        // Утверждение авиакомпании гаснет вместе с отправкой: отчёт, которого
        // она больше не видит, не может оставаться утверждённым.
        data: { submittedAt: null, pricingApprovedAt: null, airlineApprovedAt: null }
      })

      // Публикуем событие по заявке: у авиакомпании открытая страница сделает refetch
      // и отчёт скроется без перезагрузки.
      await finishPassengerRequestMutation({
        context,
        // В журнал заявки уходит ЗАЯВКА, а не запись отчёта. Раньше здесь был
        // отчёт, и это давало две беды: summarizePassengerRequest в logaction
        // получал чужой документ и выдавал сводку из одних null, а почтовая
        // ветка брала passengerRequest = newData и искала заявку по
        // идентификатору ОТЧЁТА. Сама запись отчёта возвращается мутацией и
        // доступна через hotelReport, терять её незачем.
        newData: existing,
        log: {
          action: "hide_passenger_request_hotel_report",
          description: "Отчёт по гостинице ФАП скрыт от авиакомпании",
          fulldescription: `Пользователь ${getSubjectName(context)} скрыл отчёт по гостинице ${existing.livingService?.hotels?.[hotelIndex]?.name || "без названия"} от авиакомпании в ФАП ${existing.flightNumber}`,
          airlineId: existing.airlineId,
          passengerRequestId: requestId
        }
      })

      return updated
    },

    setPassengerRequestHotelReportPricingApproved: async (
      _,
      { requestId, hotelIndex, approved },
      context
    ) => {
      const existing = await loadRequestOrThrow(requestId)
      assertCanAccessRequest(context, existing)
      assertHotelScopeAccess(
        context,
        existing.livingService?.hotels || [],
        hotelIndex
      )
      const hotel = existing.livingService?.hotels?.[hotelIndex]

      const report = await prisma.passengerRequestHotelReport.findUnique({
        where: reportWhere(requestId, hotelIndex)
      })
      if (!report) throw new GraphQLError("Отчёт ещё не сохранён")
      if (approved && report.submittedAt == null) {
        throw new GraphQLError(
          "Сначала отправьте отчёт на проверку",
          { extensions: { code: "BAD_USER_INPUT" } }
        )
      }

      const updated = await prisma.passengerRequestHotelReport.update({
        where: { id: report.id },
        // Снятие согласования прячет от авиакомпании суммы — то, под чем она
        // подписалась. Утверждение вместе с ними и снимаем.
        data: {
          pricingApprovedAt: approved ? new Date() : null,
          ...(approved ? {} : { airlineApprovedAt: null })
        }
      })

      await finishPassengerRequestMutation({
        context,
        newData: existing,
        log: {
          action: approved
            ? "approve_passenger_request_hotel_report_pricing"
            : "revoke_passenger_request_hotel_report_pricing",
          description: approved
            ? "Ценообразование отчёта ФАП согласовано"
            : "Согласование ценообразования отчёта ФАП снято",
          fulldescription: `Пользователь ${getSubjectName(context)} ${approved ? "согласовал" : "снял согласование"} ценообразования отчёта по гостинице ${hotel?.name || "без названия"} в ФАП ${existing.flightNumber}`,
          airlineId: existing.airlineId,
          passengerRequestId: requestId,
          skipEmail: !approved,
          emailAction: approved
            ? "approve_passenger_request_hotel_report_pricing"
            : undefined,
          emailExtras: approved ? { hotelName: hotel?.name || "без названия" } : {},
          alsoNotifyAirline: approved
        },
        notify: approved
          ? {
              action: "approve_passenger_request_hotel_report_pricing",
              passengerRequestId: existing.id,
              airlineId: existing.airlineId,
              hotelId: hotel?.hotelId || undefined,
              descriptionHtml: `В ФАП <span style='color:#545873'>${existing.flightNumber}</span> расчёт по гостинице <span style='color:#545873'>${hotel?.name ?? "без названия"}</span> согласован`,
              __typename: "PassengerRequestUpdatedNotification"
            }
          : null
      })

      return updated
    },

    setPassengerRequestHotelReportAirlineApproved: async (
      _,
      { requestId, hotelIndex, approved },
      context
    ) => {
      const existing = await loadRequestOrThrow(requestId)
      assertCanAccessRequest(context, existing)
      // Гейт по субъекту, а не по индексу гостиницы: assertHotelScopeAccess
      // авиакомпанию не касается (он молчит для всех, кроме гостиничного
      // скоупа), а закрыть нужно именно диспетчера и гостиницу.
      assertAirlineSubject(context)
      const hotel = existing.livingService?.hotels?.[hotelIndex]

      const report = await prisma.passengerRequestHotelReport.findUnique({
        where: reportWhere(requestId, hotelIndex)
      })
      if (!report) throw new GraphQLError("Отчёт ещё не сохранён")
      // Утверждают отчёт целиком, вместе с суммами. Пока цены не согласованы,
      // авиакомпания видит состав со стоимостями null (maskReportRowPrices) —
      // подписываться там не подо что.
      if (approved && report.pricingApprovedAt == null) {
        throw new GraphQLError(
          "Отчёт можно утвердить только после согласования цен",
          { extensions: { code: "BAD_USER_INPUT" } }
        )
      }

      const updated = await prisma.passengerRequestHotelReport.update({
        where: { id: report.id },
        data: { airlineApprovedAt: approved ? new Date() : null }
      })

      await finishPassengerRequestMutation({
        context,
        // В журнал уходит ЗАЯВКА, а не запись отчёта — по той же причине, что у
        // соседних мутаций отчёта выше.
        newData: existing,
        log: {
          action: approved
            ? "approve_passenger_request_hotel_report_airline"
            : "revoke_passenger_request_hotel_report_airline",
          description: approved
            ? "Отчёт ФАП утверждён авиакомпанией"
            : "Утверждение отчёта ФАП отозвано авиакомпанией",
          fulldescription: `Пользователь ${getSubjectName(context)} ${approved ? "утвердил" : "отозвал утверждение"} отчёта по гостинице ${hotel?.name || "без названия"} в ФАП ${existing.flightNumber}`,
          airlineId: existing.airlineId,
          passengerRequestId: requestId,
          // Письмо — только на утверждении: отзыв ничего не открывает и не
          // закрывает, о нём достаточно истории заявки. Так же устроено
          // согласование цен выше.
          skipEmail: !approved,
          emailAction: approved
            ? "approve_passenger_request_hotel_report_airline"
            : undefined,
          emailExtras: approved ? { hotelName: hotel?.name || "без названия" } : {}
          // alsoNotifyAirline не нужен: действие совершает сама авиакомпания,
          // а sendRequestPartyEmail для недиспетчерского актора и так шлёт
          // диспетчерским отделам.
        },
        notify: approved
          ? {
              action: "approve_passenger_request_hotel_report_airline",
              passengerRequestId: existing.id,
              airlineId: existing.airlineId,
              hotelId: hotel?.hotelId || undefined,
              descriptionHtml: `В ФАП <span style='color:#545873'>${existing.flightNumber}</span> отчёт по гостинице <span style='color:#545873'>${hotel?.name ?? "без названия"}</span> утверждён авиакомпанией`,
              __typename: "PassengerRequestUpdatedNotification"
            }
          : null
      })

      return updated
    }
  }
}
