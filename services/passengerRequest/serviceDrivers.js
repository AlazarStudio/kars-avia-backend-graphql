// Адресация водителей внутри embedded-сервисов ФАП (трансфер, доставка багажа).
//
// drivers[] адресуется индексом, а PWA-ссылка водителя выпускается один раз при
// создании и запоминает адрес. После удаления водителя из середины индексы
// выживших съезжают, и старая ссылка начинает указывать на чужую запись —
// водитель открывает не свою доставку. Поэтому у каждого водителя есть
// собственный id, который и попадает в ссылку; индекс остаётся транспортом
// для мутаций, но опорным идентификатором больше не является.

import { v4 as uuidv4 } from "uuid"

export const newDriverId = () => uuidv4()

// Проставляет id водителям, у которых его ещё нет (записи, созданные до
// появления поля). Существующие id не трогает, исходный массив не мутирует.
export const ensureDriverIds = (drivers, makeId = newDriverId) => {
  if (!Array.isArray(drivers)) return []
  return drivers.map((driver) => {
    const current = typeof driver?.id === "string" ? driver.id.trim() : ""
    return { ...driver, id: current || makeId() }
  })
}

const readLinkParam = (linkPWA, param) => {
  if (typeof linkPWA !== "string" || !linkPWA) return null
  try {
    return new URL(linkPWA).searchParams.get(param)
  } catch {
    return null
  }
}

// Индекс, на который ссылка была выпущена: по нему заведён внешний
// пользователь водителя (driver-{requestId}-{serviceKind}-{driverIndex}).
export const readLinkDriverIndex = (linkPWA) => {
  const raw = readLinkParam(linkPWA, "driverIndex")
  if (raw == null || raw === "") return null
  const index = Number.parseInt(raw, 10)
  return Number.isInteger(index) && index >= 0 ? index : null
}

// Ссылка ведёт именно к этому водителю, только если несёт его id.
// Ссылки без driverId адресуют водителя индексом и после сдвига врут.
export const linkTargetsDriver = (linkPWA, driverId) => {
  if (!driverId) return false
  return readLinkParam(linkPWA, "driverId") === driverId
}

// Выжившие после удалённого водителя: их индексы съехали на один вниз.
// Возвращаем тех, чья ссылка не привязана к id, — их нужно перевыпустить.
export const findStaleDriverLinks = (drivers, removedIndex) => {
  if (!Array.isArray(drivers)) return []
  const stale = []
  for (let index = removedIndex; index < drivers.length; index++) {
    const driver = drivers[index]
    if (!driver?.linkPWA) continue
    if (linkTargetsDriver(driver.linkPWA, driver.id)) continue
    stale.push({ index, driver })
  }
  return stale
}
