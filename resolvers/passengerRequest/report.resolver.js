// Отчёт гостиницы по проживанию: сохранение, отправка, скрытие.

import { prisma } from "../../prisma.js"
import { GraphQLError } from "graphql"
import { makeRoomCategoryLabel } from "../../services/passengerRequest/normalizers.js"
import {
  getSubjectName,
  loadRequestOrThrow,
  publishPassengerRequestUpdated
} from "../../services/passengerRequest/envelope.js"
import { reportRowsEqual } from "../../services/passengerRequest/hotelReportRows.js"
import { logPassengerRequestAction } from "../../services/passengerRequest/logging.js"
import { notifyPassengerRequestSite } from "../../services/passengerRequest/notify.js"

export default {
  Mutation: {
    savePassengerRequestHotelReport: async (
      _,
      { requestId, hotelIndex, reportRows },
      context
    ) => {
      const existing = await loadRequestOrThrow(requestId)

      const rows = reportRows.map((row) => ({
        fullName: row.fullName ?? "",
        personId: row.personId ?? "",
        roomNumber: row.roomNumber ?? "",
        roomCategory: makeRoomCategoryLabel(row.roomCategory, row.roomKind),
        roomKind: row.roomKind ?? "",
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

      // Флаг отправки сбрасываем ТОЛЬКО если строки реально изменились: автосейв
      // дёргается ещё и флашем на размонтировании страницы и перед выгрузкой Excel,
      // и без этой проверки флаг слетал бы от простого захода в отчёт.
      const prev = await prisma.passengerRequestHotelReport.findUnique({
        where: {
          passengerRequestId_hotelIndex: {
            passengerRequestId: requestId,
            hotelIndex
          }
        }
      })
      const rowsChanged = !reportRowsEqual(rows, prev?.reportRows)

      const report = await prisma.passengerRequestHotelReport.upsert({
        where: {
          passengerRequestId_hotelIndex: {
            passengerRequestId: requestId,
            hotelIndex
          }
        },
        create: {
          passengerRequestId: requestId,
          hotelIndex,
          reportRows: rows
        },
        update: {
          reportRows: rows,
          ...(rowsChanged && { submittedAt: null })
        }
      })
      await logPassengerRequestAction({
        context,
        action: "save_passenger_request_hotel_report",
        description: "Отчёт по гостинице ФАП сохранён",
        fulldescription: `Пользователь ${getSubjectName(context)} сохранил отчёт по гостинице ${existing.livingService?.hotels?.[hotelIndex]?.name || "без названия"} для ФАП ${existing.flightNumber}`,
        newData: report,
        airlineId: existing.airlineId,
        passengerRequestId: requestId
      })

      // Уведомляем подписчиков: другие открытые клиенты перечитают заявку и
      // увидят обновлённый отчёт/тарифы (раньше сейв отчёта событие не публиковал).
      publishPassengerRequestUpdated(existing)

      return report
    },

    submitPassengerRequestHotelReport: async (
      _,
      { requestId, hotelIndex },
      context
    ) => {
      const existing = await loadRequestOrThrow(requestId)
      const hotel = existing.livingService?.hotels?.[hotelIndex]

      const report = await prisma.passengerRequestHotelReport.findUnique({
        where: {
          passengerRequestId_hotelIndex: {
            passengerRequestId: requestId,
            hotelIndex
          }
        }
      })
      if (!report) throw new GraphQLError("Отчёт ещё не сохранён")

      const updated = await prisma.passengerRequestHotelReport.update({
        where: { id: report.id },
        data: { submittedAt: new Date() }
      })

      await logPassengerRequestAction({
        context,
        action: "submit_passenger_request_hotel_report",
        description: "Отчёт по гостинице ФАП отправлен на проверку",
        fulldescription: `Пользователь ${getSubjectName(context)} отправил отчёт по гостинице ${hotel?.name || "без названия"} на проверку в ФАП ${existing.flightNumber}`,
        newData: updated,
        airlineId: existing.airlineId,
        passengerRequestId: requestId
      })

      // Публикуем событие по заявке: у авиакомпании открытая страница сделает refetch
      // и отчёт появится без перезагрузки.
      publishPassengerRequestUpdated(existing)

      await notifyPassengerRequestSite({
        action: "submit_passenger_request_hotel_report",
        passengerRequestId: existing.id,
        airlineId: existing.airlineId,
        hotelId: hotel?.hotelId || undefined,
        descriptionHtml: `В ФАП <span style='color:#545873'>${existing.flightNumber}</span> отчёт по гостинице <span style='color:#545873'>${hotel?.name ?? "без названия"}</span> отправлен на проверку`,
        __typename: "PassengerRequestUpdatedNotification"
      })

      return updated
    },

    hidePassengerRequestHotelReport: async (
      _,
      { requestId, hotelIndex },
      context
    ) => {
      const existing = await loadRequestOrThrow(requestId)

      const report = await prisma.passengerRequestHotelReport.findUnique({
        where: {
          passengerRequestId_hotelIndex: {
            passengerRequestId: requestId,
            hotelIndex
          }
        }
      })
      if (!report) throw new GraphQLError("Отчёт ещё не сохранён")

      const updated = await prisma.passengerRequestHotelReport.update({
        where: { id: report.id },
        data: { submittedAt: null }
      })

      await logPassengerRequestAction({
        context,
        action: "hide_passenger_request_hotel_report",
        description: "Отчёт по гостинице ФАП скрыт от авиакомпании",
        fulldescription: `Пользователь ${getSubjectName(context)} скрыл отчёт по гостинице ${existing.livingService?.hotels?.[hotelIndex]?.name || "без названия"} от авиакомпании в ФАП ${existing.flightNumber}`,
        newData: updated,
        airlineId: existing.airlineId,
        passengerRequestId: requestId
      })

      // Публикуем событие по заявке: у авиакомпании открытая страница сделает refetch
      // и отчёт скроется без перезагрузки.
      publishPassengerRequestUpdated(existing)

      return updated
    }
  }
}
