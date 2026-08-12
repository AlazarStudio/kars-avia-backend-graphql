export const formatReportCurrency = (value) => {
  const n = Number(value || 0)
  return new Intl.NumberFormat("ru-RU", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2
  }).format(n)
}

const formatCellRaw = (value) => {
  if (value == null) return null
  if (typeof value === "boolean") return value ? "true" : "false"
  return String(value)
}

export const buildReportTitle = ({ type, companyData }) => {
  if (type === "HOTEL" || type === "hotel") {
    return `РЕЕСТР № # оказанных услуг по размещению экипажа в отеле "${companyData?.name || ""}" `
  }
  return `РЕЕСТР № # оказанных услуг по размещению экипажа авиакомпании "${companyData?.name || ""}" в г. ${companyData?.city || ""}`
}

export const getReportColumns = ({
  type,
  includeMeal = true,
  includeLiving = true
}) => {
  const isAirline = type === "AIRLINE" || type === "airline"

  const base = [
    { key: "index", header: "п/п", width: 6 },
    { key: "arrival", header: "Дата/время заезда", width: 25 },
    { key: "departure", header: "Дата/время выезда", width: 25 },
    { key: "totalDays", header: "Количество суток", width: 18 },
    { key: "category", header: "Категория номера", width: 30 },
    { key: "personName", header: "ФИО", width: 30 },
    { key: "roomName", header: "Комната", width: 18 },
    { key: "shareNote", header: "Вид проживания", width: 24 }
  ]

  if (isAirline) {
    base.push({ key: "personPosition", header: "Должность", width: 20 })
  }

  const mealCols = [
    { key: "breakfastCount", header: "Завтрак", width: 10 },
    { key: "lunchCount", header: "Обед", width: 10 },
    { key: "dinnerCount", header: "Ужин", width: 10 },
    { key: "totalMealCost", header: "Стоимость питания", width: 18, summable: true }
  ]

  const livingCols = [
    {
      key: "totalLivingCost",
      header: "Стоимость проживания",
      width: 18,
      summable: true
    }
  ]

  const tail = [
    { key: "totalDebt", header: "Итоговая стоимость", width: 18, summable: true }
  ]

  if (isAirline) {
    tail.push({ key: "hotelName", header: "Гостиница", width: 30 })
  }

  return [
    ...base,
    ...(includeMeal ? mealCols : []),
    ...(includeLiving ? livingCols : []),
    ...tail
  ]
}

const getCellDisplayValue = (col, row, { includeMeal, includeLiving }) => {
  switch (col.key) {
    case "breakfastCount":
      return row.breakfastIncludedInPrice ? "вкл" : String(row.breakfastCount ?? 0)
    case "totalMealCost":
      return formatReportCurrency(row.totalMealCost)
    case "totalLivingCost":
      return formatReportCurrency(row.totalLivingCost)
    case "totalDebt":
      return formatReportCurrency(
        (includeMeal ? +row.totalMealCost || 0 : 0) +
          (includeLiving ? +row.totalLivingCost || 0 : 0)
      )
    default:
      if (row[col.key] == null) return ""
      return String(row[col.key])
  }
}

const getCellRawValue = (col, row, { includeMeal, includeLiving }) => {
  switch (col.key) {
    case "totalDebt":
      return (
        (includeMeal ? +row.totalMealCost || 0 : 0) +
        (includeLiving ? +row.totalLivingCost || 0 : 0)
      )
    case "breakfastCount":
      return row.breakfastIncludedInPrice ? "вкл" : row.breakfastCount ?? 0
    default:
      return row[col.key]
  }
}

const buildPresentationRow = (row, columns, options) => ({
  cells: columns.map((col) => ({
    key: col.key,
    value: getCellDisplayValue(col, row, options),
    raw: formatCellRaw(getCellRawValue(col, row, options))
  }))
})

export const buildReportPresentation = ({
  type,
  rows = [],
  companyData = {},
  createFilterInput = {}
}) => {
  const includeMeal = createFilterInput?.meal !== false
  const includeLiving = createFilterInput?.living !== false
  const columns = getReportColumns({ type, includeMeal, includeLiving })
  const options = { includeMeal, includeLiving }

  const header = {
    companyNameFull: companyData.nameFull || companyData.name || "",
    contractName: companyData.contractName || "",
    city: companyData.city || "",
    title: buildReportTitle({ type, companyData })
  }

  const dataRows = (rows || []).map((row) =>
    buildPresentationRow(row, columns, options)
  )

  const totalsLabelKey =
    type === "AIRLINE" || type === "airline" ? "personPosition" : "shareNote"

  const totalsCells = columns.map((col) => {
    if (col.key === totalsLabelKey) {
      return { key: col.key, value: "ИТОГО:", raw: "ИТОГО:" }
    }

    if (col.key === "totalMealCost" && includeMeal) {
      const sum = rows.reduce((acc, r) => acc + (+r.totalMealCost || 0), 0)
      return {
        key: col.key,
        value: formatReportCurrency(sum),
        raw: String(sum)
      }
    }

    if (col.key === "totalLivingCost" && includeLiving) {
      const sum = rows.reduce((acc, r) => acc + (+r.totalLivingCost || 0), 0)
      return {
        key: col.key,
        value: formatReportCurrency(sum),
        raw: String(sum)
      }
    }

    if (col.key === "totalDebt") {
      const sum = rows.reduce(
        (acc, r) =>
          acc +
          ((includeMeal ? +r.totalMealCost || 0 : 0) +
            (includeLiving ? +r.totalLivingCost || 0 : 0)),
        0
      )
      return {
        key: col.key,
        value: formatReportCurrency(sum),
        raw: String(sum)
      }
    }

    return { key: col.key, value: "", raw: null }
  })

  return {
    header,
    columns: columns.map(({ key, header, width }) => ({ key, header, width })),
    dataRows,
    totalsRow: { cells: totalsCells }
  }
}

export const presentationToExcelRows = (presentation) => {
  const keys = presentation.columns.map((c) => c.key)
  const toObj = (row) => {
    const obj = {}
    for (const cell of row.cells) obj[cell.key] = cell.value
    return obj
  }
  const dataRows = presentation.dataRows.map(toObj)
  const totalsRow = presentation.totalsRow ? toObj(presentation.totalsRow) : null
  return { keys, dataRows, totalsRow }
}
