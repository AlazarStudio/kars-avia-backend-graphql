import { randomUUID } from "crypto"
import { prisma } from "../../../prisma.js"
import { uploadBuffer } from "../../files/uploadFiles.js"
import { resolveCreatorDepartmentFromSender } from "../../notification/resolveCreatorAirlineDepartment.js"
import { generateNextRequestNumber } from "../generateRequestNumber.js"
import {
  parseBulkRequestXlsxBuffer,
  readUploadToBuffer
} from "./parseBulkRequestXlsx.js"
import logAction from "../../infra/logaction.js"

async function assertNoExistingLinkNumbers(airlineId, linkNumbers) {
  const existing = await prisma.request.findFirst({
    where: {
      airlineId,
      linkNumber: { in: linkNumbers },
      status: { not: "canceled" }
    },
    select: { linkNumber: true, requestNumber: true }
  })
  if (existing) {
    throw new Error(
      `Заявки с номером связки ${existing.linkNumber} уже существуют (например, ${existing.requestNumber})`
    )
  }
}

function normalizeMealPlan(mealPlan) {
  if (!mealPlan) return undefined
  if (mealPlan.included) {
    mealPlan.breakfastEnabled = mealPlan.breakfastEnabled || false
    mealPlan.lunchEnabled = mealPlan.lunchEnabled || false
    mealPlan.dinnerEnabled = mealPlan.dinnerEnabled || false
  }
  return mealPlan
}

async function createSingleBulkRequest(
  tx,
  {
    row,
    input,
    bulkGroupId,
    sourceFilePath,
    creatorDepartmentId,
    sequenceState
  }
) {
  const { requestNumber, nextSequence } = await generateNextRequestNumber(
    tx,
    input.airportId,
    sequenceState.current
  )
  sequenceState.current = nextSequence

  const mealPlan = normalizeMealPlan(input.mealPlan ? { ...input.mealPlan } : null)

  const newRequest = await tx.request.create({
    data: {
      airport: { connect: { id: input.airportId } },
      arrival: row.arrival,
      departure: row.departure,
      mealPlan,
      airline: { connect: { id: input.airlineId } },
      sender: { connect: { id: input.senderId } },
      ...(creatorDepartmentId
        ? { airlineDepartment: { connect: { id: creatorDepartmentId } } }
        : {}),
      status: "created",
      reserve: input.reserve ?? false,
      defaultTimesUsed: input.defaultTimesUsed ?? false,
      files: sourceFilePath ? [sourceFilePath] : [],
      requestNumber,
      bulkGroupId,
      linkNumber: row.linkNumber,
      arrivalFlightNumber: row.arrivalFlightNumber,
      arrivalAircraftType: row.arrivalAircraftType,
      arrivalFlightStatus: row.arrivalFlightStatus,
      departureFlightNumber: row.departureFlightNumber,
      departureAircraftType: row.departureAircraftType,
      departureFlightStatus: row.departureFlightStatus,
      singleRoomCount: row.singleRoomCount,
      doubleRoomCount: row.doubleRoomCount
    },
    include: {
      airline: true,
      airport: true
    }
  })

  const newChat = await tx.chat.create({
    data: {
      request: { connect: { id: newRequest.id } },
      separator: "airline",
      airline: { connect: { id: input.airlineId } }
    }
  })

  await tx.chatUser.create({
    data: {
      chat: { connect: { id: newChat.id } },
      user: { connect: { id: input.senderId } }
    }
  })

  return newRequest
}

export async function importBulkRequestsFromFile({ file, input, context }) {
  const { buffer, filename } = await readUploadToBuffer(file)
  const { rows, errors } = parseBulkRequestXlsxBuffer(buffer)

  if (errors.length > 0) {
    return {
      bulkGroupId: input.bulkGroupId || "",
      createdCount: 0,
      linkNumbers: [],
      errors,
      sourceFile: null,
      firstRequest: null
    }
  }

  const bulkGroupId = input.bulkGroupId || randomUUID()
  const linkNumbers = rows.map((r) => r.linkNumber)

  await assertNoExistingLinkNumbers(input.airlineId, linkNumbers)

  const sourceFilePath = await uploadBuffer(buffer, filename, {
    bucket: "requests"
  })

  const creatorDepartmentId = await resolveCreatorDepartmentFromSender({
    senderId: input.senderId,
    personId: null
  })

  const sequenceState = { current: null }
  let createdCount = 0
  const createdRequests = []

  await prisma.$transaction(async (tx) => {
    for (const row of rows) {
      for (let i = 0; i < row.crewCount; i++) {
        const request = await createSingleBulkRequest(tx, {
          row,
          input,
          bulkGroupId,
          sourceFilePath,
          creatorDepartmentId,
          sequenceState
        })
        createdRequests.push(request)
        createdCount++
      }
    }
  })

  try {
    const { user } = context
    await logAction({
      context,
      action: "import_bulk_requests",
      description: "Массовый импорт заявок",
      fulldescription: `Пользователь ${user?.name || "—"} импортировал ${createdCount} заявок (пакет ${bulkGroupId})`,
      newData: {
        bulkGroupId,
        createdCount,
        linkNumbers
      },
      airlineId: input.airlineId
    })
  } catch (error) {
    console.error("Ошибка при логировании массового импорта:", error)
  }

  return {
    bulkGroupId,
    createdCount,
    linkNumbers,
    errors: [],
    sourceFile: sourceFilePath,
    firstRequest: createdRequests[0] || null
  }
}
