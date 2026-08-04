// Логирование действий ФАП: запись в историю заявки, письмо участникам и
// сборка описаний патчей водителя. Вынесено из резолвера как есть.

import logAction from "../infra/logaction.js"
import { sendRequestPartyEmail } from "../notification/sendRequestPartyEmail.js"
import { buildPassengerRequestEmail } from "../notification/buildPassengerRequestEmail.js"
import {
  getDispatcherFallbackForPassengerEmail,
  resolveEmailActionForLog
} from "../notification/passengerRequestEmailActions.js"
import { tripReportCost } from "./baggageDelivery.js"

export const logPassengerRequestAction = async ({
  context,
  action,
  description,
  fulldescription = null,
  reason = null,
  oldData = null,
  newData = null,
  airlineId = null,
  passengerRequestId = null,
  emailAction = null,
  skipEmail = false,
  emailExtras = {},
  cancelReason = null
}) => {
  try {
    await logAction({
      context,
      action,
      reason,
      description,
      fulldescription,
      oldData,
      newData,
      airlineId,
      passengerRequestId
    })
  } catch (error) {
    console.error("Ошибка логирования действия ФАП:", error)
  }

  if (skipEmail) return

  const passengerRequest = newData ?? oldData
  const resolvedAirlineId = airlineId ?? passengerRequest?.airlineId
  if (!passengerRequest?.id || !resolvedAirlineId) return

  try {
    const menuAction = emailAction ?? resolveEmailActionForLog(action)
    const { subject, html } = await buildPassengerRequestEmail({
      emailAction: menuAction,
      passengerRequest,
      description,
      fulldescription,
      cancelReason: cancelReason ?? reason,
      emailExtras
    })

    await sendRequestPartyEmail({
      actor: context.user ?? context.subject,
      airlineId: resolvedAirlineId,
      action: menuAction,
      subject,
      html,
      entityType: "passenger_request",
      entityId: passengerRequest.id,
      dispatcherFallbackTo: getDispatcherFallbackForPassengerEmail(menuAction)
    })
  } catch (error) {
    console.error("Ошибка отправки email по ФАП:", error)
  }
}

export function fmtPickupForLog(iso) {
  if (!iso) return "—"
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return "—"
  const pad = (n) => String(n).padStart(2, "0")
  return `${pad(d.getUTCDate())}.${pad(d.getUTCMonth() + 1)}.${d.getUTCFullYear()} ${pad(d.getUTCHours())}:${pad(d.getUTCMinutes())} UTC`
}

export function buildDriverPatchDescription(before, applied, driverIndex, direction) {
  const dirLabel = direction === "DEPARTURE" ? "вылет" : "прилёт"
  const driverLabel = before?.fullName ? `«${before.fullName}»` : `#${driverIndex + 1}`
  const diffs = []
  if ("pickupAt" in applied) {
    diffs.push(`подача: ${fmtPickupForLog(before?.pickupAt)} → ${fmtPickupForLog(applied.pickupAt)}`)
  }
  if ("vehicleType" in applied) {
    diffs.push(`тип ТС: "${before?.vehicleType ?? ""}" → "${applied.vehicleType ?? ""}"`)
  }
  if ("reportCost" in applied) {
    diffs.push(`сумма: ${before?.reportCost ?? 0} → ${applied.reportCost ?? 0}`)
  }
  if ("transportedCount" in applied) {
    diffs.push(
      `перевезено: ${before?.transportedCount ?? "—"} → ${applied.transportedCount ?? "—"}`
    )
  }
  if (!diffs.length) {
    return {
      short: `Заявка ${driverLabel} (${dirLabel}): изменения сохранены`,
      full: `Заявка ${driverLabel} в трансфере (${dirLabel}): изменения сохранены`,
    }
  }
  return {
    short: `Заявка ${driverLabel} (${dirLabel}): ${diffs.join(", ")}`,
    full: `Заявка ${driverLabel} в трансфере (${dirLabel}). Изменения: ${diffs.join("; ")}.`,
  }
}

export function buildBaggageDriverPatchDescription(before, applied, driverIndex) {
  // Метка — по водителю: поездка теперь везёт список пассажиров, и имя первого
  // из них в заголовке лога вводило бы в заблуждение.
  const label = before?.fullName ? `«${before.fullName}»` : `#${driverIndex + 1}`
  const diffs = []
  if ("peopleCount" in applied) {
    diffs.push(
      `ожидаемое кол-во пассажиров: ${before?.peopleCount ?? "—"} → ${applied.peopleCount ?? "—"}`
    )
  }
  if ("vehicleType" in applied) {
    diffs.push(`тип ТС: "${before?.vehicleType ?? ""}" → "${applied.vehicleType ?? ""}"`)
  }
  if ("deliveryCompletedAt" in applied) {
    diffs.push(
      `дата доставки: ${fmtPickupForLog(before?.deliveryCompletedAt)} → ${fmtPickupForLog(applied.deliveryCompletedAt)}`
    )
  }
  if ("people" in applied) {
    // Бирок и суммы в патче больше нет: бирки живут на пассажире, сумма поездки
    // производная. Поэтому описываем состав пассажиров и его цену.
    const from = (before?.people ?? []).length
    const to = (applied.people ?? []).length
    // «—», а не 0: у поездки без пассажиров суммы нет, считать не из чего.
    const fromCost = tripReportCost(before?.people) ?? "—"
    const toCost = tripReportCost(applied.people) ?? "—"
    diffs.push(
      `пассажиры: ${from} → ${to}, сумма поездки: ${fromCost} → ${toCost}`
    )
  }
  // Ветки «изменений нет» здесь быть не может: collectBaggageDriverPatch отдаёт
  // только эти ключи, а пустой патч резолвер отсекает раньше.
  return {
    short: `Доставка багажа ${label}: ${diffs.join(", ")}`,
    full: `Доставка багажа ${label}. Изменения: ${diffs.join("; ")}.`
  }
}
