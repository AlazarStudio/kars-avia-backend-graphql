export function getMonthYearParts(date = new Date()) {
  const month = String(date.getMonth() + 1).padStart(2, "0")
  const year = String(date.getFullYear()).slice(-2)
  return { month, year }
}

export function getMonthBounds(date = new Date()) {
  const startOfMonth = new Date(date.getFullYear(), date.getMonth(), 1)
  const endOfMonth = new Date(
    date.getFullYear(),
    date.getMonth() + 1,
    0,
    23,
    59,
    59
  )
  return { startOfMonth, endOfMonth }
}

export async function getLastSequenceNumber(prisma, date = new Date()) {
  const { startOfMonth, endOfMonth } = getMonthBounds(date)
  const lastRequest = await prisma.request.findFirst({
    where: { createdAt: { gte: startOfMonth, lte: endOfMonth } },
    orderBy: { createdAt: "desc" }
  })
  if (lastRequest?.requestNumber) {
    return parseInt(lastRequest.requestNumber.slice(0, 4), 10) || 0
  }
  return 0
}

export function formatRequestNumber(sequenceNumber, airportCode, month, year) {
  const seq = String(sequenceNumber).padStart(4, "0")
  return `${seq}${airportCode}${month}${year}e`
}

export async function generateNextRequestNumber(
  prisma,
  airportId,
  currentSequence = null
) {
  const airport = await prisma.airport.findUnique({
    where: { id: airportId }
  })
  if (!airport) {
    throw new Error("Airport not found")
  }

  const { month, year } = getMonthYearParts()
  let seq =
    currentSequence === null
      ? (await getLastSequenceNumber(prisma)) + 1
      : currentSequence + 1

  return {
    requestNumber: formatRequestNumber(seq, airport.code, month, year),
    nextSequence: seq,
    airport
  }
}
