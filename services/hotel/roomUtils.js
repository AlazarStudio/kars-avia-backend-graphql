import { prisma } from "../../prisma.js"

const categoryToPlaces = {
  apartment: 2,
  studio: 2,
  luxe: 2,
  onePlace: 1,
  twoPlace: 2,
  threePlace: 3,
  fourPlace: 4,
  fivePlace: 5,
  sixPlace: 6,
  sevenPlace: 7,
  eightPlace: 8,
  ninePlace: 9,
  tenPlace: 10
}

export const calculatePlaces = (category) => categoryToPlaces[category] || 1

export const updateHotelRoomCounts = async (hotelId) => {
  const provisionCount = await prisma.room.count({
    where: {
      hotelId,
      reserve: true
    }
  })

  const quoteCount = await prisma.room.count({
    where: {
      hotelId,
      reserve: false
    }
  })

  return await prisma.hotel.update({
    where: { id: hotelId },
    data: {
      provision: provisionCount,
      quote: quoteCount
    }
  })
}

export const updateRoomKindCounts = async (roomKindId) => {
  const roomsCount = await prisma.room.count({
    where: { roomKindId }
  })

  return await prisma.roomKind.update({
    where: { id: roomKindId },
    data: { roomsCount }
  })
}

