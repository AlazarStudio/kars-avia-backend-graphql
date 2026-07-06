import xlsx from "xlsx"

const HEADER_MATCHERS = {
  crewCount: (h) => h === "Количество ЧЭ",
  arrivalDate: (h) => h === "Дата заезда LOC",
  arrivalTime: (h) => h === "Время заезда LOC",
  arrivalFlightNumber: (h) => h === "Рейс прибытия",
  arrivalAircraftType: (h) => h === "Тип ВС прибытия",
  arrivalFlightStatus: (h) =>
    h.startsWith("Статус рейса прибытия"),
  departureDate: (h) => h === "Дата выезда LOC",
  departureTime: (h) => h === "Время выезда LOC",
  departureFlightNumber: (h) => h === "Рейс отправления",
  departureAircraftType: (h) => h === "Тип ВС отправления",
  departureFlightStatus: (h) =>
    h.startsWith("Статус рейса отправления"),
  singleRoomCount: (h) => h === "Количество одноместных",
  doubleRoomCount: (h) => h === "Количество двухместных",
  linkNumber: (h) => h === "Номер связки"
}

function normalizeHeader(header) {
  return String(header || "")
    .replace(/\s+/g, " ")
    .trim()
}

function mapHeaders(rawHeaders) {
  const mapping = {}
  for (const raw of rawHeaders) {
    const header = normalizeHeader(raw)
    for (const [field, matcher] of Object.entries(HEADER_MATCHERS)) {
      if (matcher(header)) {
        mapping[field] = raw
        break
      }
    }
  }
  return mapping
}

function parseExcelDate(value) {
  if (value === null || value === undefined || value === "") return null
  if (value instanceof Date && !isNaN(value.getTime())) return value
  if (typeof value === "number" && !isNaN(value)) {
    const parsed = xlsx.SSF.parse_date_code(value)
    if (parsed) {
      return new Date(parsed.y, parsed.m - 1, parsed.d)
    }
  }
  const str = String(value).trim()
  const match = str.match(/^(\d{1,2})\.(\d{1,2})\.(\d{4})$/)
  if (match) {
    const [, d, m, y] = match
    return new Date(Number(y), Number(m) - 1, Number(d))
  }
  const iso = new Date(str)
  if (!isNaN(iso.getTime())) return iso
  return null
}

function parseExcelTime(value) {
  if (value === null || value === undefined || value === "") return null
  if (typeof value === "number" && !isNaN(value)) {
    const totalMinutes = Math.round(value * 24 * 60)
    const hours = Math.floor(totalMinutes / 60) % 24
    const minutes = totalMinutes % 60
    return { hours, minutes }
  }
  const str = String(value).trim()
  const match = str.match(/^(\d{1,2}):(\d{2})$/)
  if (match) {
    return { hours: Number(match[1]), minutes: Number(match[2]) }
  }
  return null
}

function combineDateAndTime(dateValue, timeValue) {
  const date = parseExcelDate(dateValue)
  const time = parseExcelTime(timeValue)
  if (!date) return null
  const hours = time?.hours ?? 0
  const minutes = time?.minutes ?? 0
  return new Date(
    date.getFullYear(),
    date.getMonth(),
    date.getDate(),
    hours,
    minutes,
    0,
    0
  )
}

function normalizeFlightStatus(value) {
  const str = String(value || "").trim().toUpperCase()
  if (str === "П" || str === "P") return "P"
  if (str === "Р" || str === "R") return "R"
  return str || null
}

function parseIntField(value, fieldName) {
  if (value === null || value === undefined || value === "") {
    throw new Error(`Поле «${fieldName}» обязательно`)
  }
  const num = parseInt(String(value).trim(), 10)
  if (isNaN(num) || num < 0) {
    throw new Error(`Некорректное значение «${fieldName}»: ${value}`)
  }
  return num
}

function getCell(row, columnKey) {
  if (!columnKey) return undefined
  return row[columnKey]
}

function parseRow(row, mapping, rowIndex) {
  const crewCount = parseIntField(
    getCell(row, mapping.crewCount),
    "Количество ЧЭ"
  )
  if (crewCount <= 0) {
    throw new Error("Количество ЧЭ должно быть больше 0")
  }

  const arrival = combineDateAndTime(
    getCell(row, mapping.arrivalDate),
    getCell(row, mapping.arrivalTime)
  )
  const departure = combineDateAndTime(
    getCell(row, mapping.departureDate),
    getCell(row, mapping.departureTime)
  )

  if (!arrival) {
    throw new Error("Не удалось разобрать дату/время заезда")
  }
  if (!departure) {
    throw new Error("Не удалось разобрать дату/время выезда")
  }
  if (departure <= arrival) {
    throw new Error("Дата выезда должна быть позже даты заезда")
  }

  const linkNumber = String(getCell(row, mapping.linkNumber) || "").trim()
  if (!linkNumber) {
    throw new Error("Номер связки обязателен")
  }

  return {
    rowIndex,
    crewCount,
    arrival,
    departure,
    arrivalFlightNumber:
      String(getCell(row, mapping.arrivalFlightNumber) || "").trim() || null,
    arrivalAircraftType:
      String(getCell(row, mapping.arrivalAircraftType) || "").trim() || null,
    arrivalFlightStatus: normalizeFlightStatus(
      getCell(row, mapping.arrivalFlightStatus)
    ),
    departureFlightNumber:
      String(getCell(row, mapping.departureFlightNumber) || "").trim() || null,
    departureAircraftType:
      String(getCell(row, mapping.departureAircraftType) || "").trim() || null,
    departureFlightStatus: normalizeFlightStatus(
      getCell(row, mapping.departureFlightStatus)
    ),
    singleRoomCount: parseIntField(
      getCell(row, mapping.singleRoomCount),
      "Количество одноместных"
    ),
    doubleRoomCount: parseIntField(
      getCell(row, mapping.doubleRoomCount),
      "Количество двухместных"
    ),
    linkNumber
  }
}

function isEmptyRow(row) {
  return Object.values(row).every(
    (v) => v === null || v === undefined || String(v).trim() === ""
  )
}

export async function readUploadToBuffer(file) {
  const { createReadStream, filename } = await file
  const stream = createReadStream()
  const chunks = []
  for await (const chunk of stream) {
    chunks.push(chunk)
  }
  return { buffer: Buffer.concat(chunks), filename }
}

export function parseBulkRequestXlsxBuffer(buffer) {
  const workbook = xlsx.read(buffer, { type: "buffer", cellDates: true })
  const sheetName = workbook.SheetNames[0]
  if (!sheetName) {
    throw new Error("Файл не содержит листов")
  }

  const worksheet = workbook.Sheets[sheetName]
  const rawRows = xlsx.utils.sheet_to_json(worksheet, {
    defval: "",
    raw: false
  })

  if (rawRows.length === 0) {
    throw new Error("Файл не содержит данных")
  }

  const mapping = mapHeaders(Object.keys(rawRows[0]))
  const requiredFields = [
    "crewCount",
    "arrivalDate",
    "arrivalTime",
    "departureDate",
    "departureTime",
    "linkNumber"
  ]
  const missing = requiredFields.filter((f) => !mapping[f])
  if (missing.length > 0) {
    throw new Error(
      `В файле отсутствуют обязательные колонки: ${missing.join(", ")}`
    )
  }

  const rows = []
  const errors = []
  const linkNumbersInFile = new Set()

  rawRows.forEach((row, index) => {
    const rowIndex = index + 2
    if (isEmptyRow(row)) return

    try {
      const parsed = parseRow(row, mapping, rowIndex)
      if (linkNumbersInFile.has(parsed.linkNumber)) {
        throw new Error(
          `Дублирующийся номер связки в файле: ${parsed.linkNumber}`
        )
      }
      linkNumbersInFile.add(parsed.linkNumber)
      rows.push(parsed)
    } catch (err) {
      errors.push({
        row: rowIndex,
        message: err.message || String(err)
      })
    }
  })

  if (rows.length === 0 && errors.length === 0) {
    throw new Error("В файле нет строк с данными")
  }

  return { rows, errors }
}
