import { GraphQLError } from "graphql"

// Закрытие интервала размещения пассажира.
//
// Логика «найти последний интервал без endAt и закрыть его» была инлайнена
// четырьмя копиями. Копии неидентичны: переселение пишет в закрываемый интервал
// только endAt, а выселение — ещё и reason, и умеет добавить вырожденный
// интервал, если открытых не осталось. Оба поведения сохранены параметрами, а
// не сведены к одному: они наблюдаемы и закреплены тестами.
//
// Закрыть интервал раньше его начала нельзя: получается перевёрнутый
// {startAt > endAt}, а по нему считаются сутки проживания. Неразбираемый
// startAt легаси-документа проверку не включает — отбивать из-за него живую
// операцию было бы новой бедой вместо старой.
//
// Поиск идёт с КОНЦА: у гостя может висеть несколько интервалов без endAt
// (легаси-аномалия), и закрывается ровно последний из них, а не все.

const closesBeforeStart = (chess, at) => {
  const start = chess?.startAt ? new Date(chess.startAt).getTime() : NaN
  const end = at instanceof Date ? at.getTime() : new Date(at).getTime()
  if (!Number.isFinite(start) || !Number.isFinite(end)) return false
  // Начало в БУДУЩЕМ — признак уже битого легаси-документа: до проверки дат
  // будущий movedAt принимался. Такому интервалу не позволено запирать гостя:
  // иначе выселить и переселить его стало бы нельзя до наступления даты, и
  // старая запись превратилась бы в неисправимую.
  if (start > Date.now()) return false
  return end < start
}

// reason === null — признак переселения: ключ reason в закрываемый интервал не
// пишется вовсе, а не пишется со значением null. Разница наблюдаема — у
// переселения прежняя причина интервала обязана остаться нетронутой.
//
// degenerate — { hotelIndex, hotelName } выселяющей гостиницы. Отсутствует у
// переселения: там открытых интервалов может не быть, и это не повод
// синтезировать запись.
export function closeOpenChess(chesses, at, { reason = null, degenerate = null } = {}) {
  const list = [...(chesses || [])]

  const openIndex = [...list].reverse().findIndex((item) => !item?.endAt)
  if (openIndex !== -1) {
    const idx = list.length - 1 - openIndex
    if (closesBeforeStart(list[idx], at)) {
      throw new GraphQLError("Date is earlier than the accommodation start", {
        extensions: { code: "BAD_USER_INPUT" }
      })
    }
    list[idx] =
      reason === null
        ? { ...list[idx], endAt: at }
        : { ...list[idx], endAt: at, reason }
    return list
  }

  if (!degenerate) return list

  list.push({
    hotelIndex: degenerate.hotelIndex,
    hotelName: degenerate.hotelName ?? null,
    startAt: at,
    endAt: at,
    reason
  })
  return list
}
