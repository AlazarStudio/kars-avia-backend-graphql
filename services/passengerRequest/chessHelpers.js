// Закрытие интервала размещения пассажира.
//
// Логика «найти последний интервал без endAt и закрыть его» была инлайнена
// четырьмя копиями. Копии неидентичны: переселение пишет в закрываемый интервал
// только endAt, а выселение — ещё и reason, и умеет добавить вырожденный
// интервал, если открытых не осталось. Оба поведения сохранены параметрами, а
// не сведены к одному: они наблюдаемы и закреплены тестами.
//
// Поиск идёт с КОНЦА: у гостя может висеть несколько интервалов без endAt
// (легаси-аномалия), и закрывается ровно последний из них, а не все.

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
