// Выпуск внешних ссылок ФАП: гостиничные, водительские и представительские.
// Вынесено из резолвера как есть.

import { prisma } from "../../prisma.js"
import {
  buildRepresentativeExternalKey,
  issueExternalDriverPwaLink,
  issueExternalLinksForUser,
  revokeDriverExternalAccess,
  upsertDriverExternalUser,
  upsertHotelExternalUser,
  upsertRepresentativeExternalUser
} from "../auth/externalAutoLinks.js"
import { findStaleDriverLinks, readLinkDriverIndex } from "./serviceDrivers.js"

export async function generateHotelLinks({ hotel, requestId, adminId }) {
  if (!hotel.hotelId) return { linkCRM: null, linkPWA: null }

  const hotelRecord = await prisma.hotel.findUnique({
    where: { id: hotel.hotelId },
    select: { id: true, name: true }
  })
  if (!hotelRecord) return { linkCRM: null, linkPWA: null }

  const externalUser = await upsertHotelExternalUser({
    hotelId: hotel.hotelId,
    name: hotel.name || hotelRecord.name || null
  })

  const generatedLinks = await issueExternalLinksForUser({
    externalUserId: externalUser.id,
    createdByAdminId: adminId || null,
    passengerRequestId: requestId
  })
  await prisma.hotel.update({
    where: { id: hotel.hotelId },
    data: {
      externalLinkCRM: generatedLinks.linkCRM,
      externalLinkPWA: generatedLinks.linkPWA
    }
  })
  return generatedLinks
}

export async function generateDriverLink({
  driverName,
  requestId,
  driverIndex,
  driverId,
  adminId,
  serviceKind = "transfer"
}) {
  const externalUser = await upsertDriverExternalUser({
    requestId,
    driverName,
    serviceKind,
    driverIndex,
    driverId
  })

  return issueExternalDriverPwaLink({
    externalUserId: externalUser.id,
    createdByAdminId: adminId || null,
    passengerRequestId: requestId,
    driverIndex,
    driverId,
    serviceKind
  })
}

// После удаления водителя индексы выживших съезжают, и ссылки, выпущенные до
// появления driverId, начинают указывать на чужую запись. Такие ссылки
// перевыпускаем на новый адрес, а старый доступ гасим — иначе водитель
// вернётся по прежней ссылке и снова попадёт не к себе.
// Мутирует переданный массив: линки правим до записи в БД.
export async function reissueShiftedDriverLinks({
  requestId,
  serviceKind,
  drivers,
  removedIndex,
  adminId
}) {
  for (const { index, driver } of findStaleDriverLinks(drivers, removedIndex)) {
    const previousIndex = readLinkDriverIndex(driver.linkPWA)
    try {
      const linkPWA = await generateDriverLink({
        driverName: driver.fullName,
        requestId,
        driverIndex: index,
        driverId: driver.id,
        adminId,
        serviceKind
      })
      drivers[index] = { ...driver, linkPWA }
    } catch (e) {
      // Ссылку на чужую запись оставлять нельзя: без ссылки безопаснее.
      drivers[index] = { ...driver, linkPWA: null }
      continue
    }
    if (previousIndex == null || previousIndex === index) continue
    try {
      await revokeDriverExternalAccess({
        requestId,
        serviceKind,
        driverIndex: previousIndex
      })
    } catch (e) {
      // Новая ссылка уже выпущена — гашение старой лучшее из возможного.
    }
  }
}

export async function generateRepresentativeLinksForRequest({
  requestId,
  airlineId,
  airportId,
  adminId
}) {
  const representativeKey = buildRepresentativeExternalKey({
    airlineId,
    airportId
  })

  try {
    const externalUser = await upsertRepresentativeExternalUser({
      representativeKey,
      name: null
    })
    const generatedLinks = await issueExternalLinksForUser({
      externalUserId: externalUser.id,
      createdByAdminId: adminId || null,
      passengerRequestId: requestId
    })

    // Keep array shape for backward compatibility, but only one link source.
    return [
      {
        representativeDepartmentName: null,
        ...generatedLinks
      }
    ]
  } catch (error) {
    return [
      {
        representativeDepartmentName: null,
        linkCRM: null,
        linkPWA: null
      }
    ]
  }
}
