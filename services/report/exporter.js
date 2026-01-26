import ExcelJS from "exceljs"
import fs from "fs"

const formatCurrency = (value) => {
  if (!value || isNaN(value)) return "0 ₽"
  return `${Number(value).toLocaleString("ru-RU")} ₽`
}

export const generateExcelAvia = async (
  reportData,
  filePath,
  companyData,
  filterInput
) => {
  const includeMeal = filterInput?.meal !== false // по умолчанию: вкл
  const includeLiving = filterInput?.living !== false // по умолчанию: вкл

  const workbook = new ExcelJS.Workbook()
  const sheet = workbook.addWorksheet(`${companyData.name}`)

  const font = { name: "Times New Roman", size: 12 }

  const formatCurrency = (v) => {
    const n = Number(v || 0)
    return new Intl.NumberFormat("ru-RU", {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2
    }).format(n)
  }

  const colLetter = (n) => {
    // 1 -> A, 2 -> B, ..., 27 -> AA
    let s = ""
    while (n > 0) {
      const m = (n - 1) % 26
      s = String.fromCharCode(65 + m) + s
      n = Math.floor((n - 1) / 26)
    }
    return s
  }

  // ---------- верхняя шапка ----------
  sheet.mergeCells("A1:D1")
  sheet.mergeCells("A2:D2")
  sheet.mergeCells("A3:D3")
  sheet.getCell("A1").value = `${companyData.nameFull}`
  sheet.getCell("A1").font = { name: "Times New Roman", size: 14, bold: true }
  sheet.getCell("A1").alignment = { horizontal: "left" }

  // правый блок шапки растягиваем до последней колонки (ниже вычислим lastCol)
  sheet.getCell("E1").value = `${companyData.contractName}`
  sheet.getCell("E1").font = { name: "Times New Roman", size: 12, bold: true }
  sheet.getCell("E1").alignment = { horizontal: "right" }
  sheet.getCell("E2").value = " "
  sheet.getCell("E3").value = " "

  const headerRowIndex = 5

  // ---------- схема колонок (динамическая) ----------
  const base = [
    { key: "index", header: "п/п", width: 6, getter: (r) => r.index },
    {
      key: "arrival",
      header: "Дата/время заезда",
      width: 25,
      getter: (r) => r.arrival
    },
    {
      key: "departure",
      header: "Дата/время выезда",
      width: 25,
      getter: (r) => r.departure
    },
    {
      key: "totalDays",
      header: "Количество суток",
      width: 18,
      getter: (r) => r.totalDays
    },
    {
      key: "category",
      header: "Категория номера",
      width: 30,
      getter: (r) => r.category
    },
    {
      key: "personName",
      header: "ФИО",
      width: 30,
      getter: (r) => r.personName
    },
    {
      key: "roomName",
      header: "Комната",
      width: 18,
      getter: (r) => r.roomName
    },
    {
      key: "shareNote",
      header: "Вид проживания",
      width: 24,
      getter: (r) => r.shareNote
    },
    {
      key: "personPosition",
      header: "Должность",
      width: 20,
      getter: (r) => r.personPosition
    }
  ]

  const mealCols = [
    {
      key: "breakfastCount",
      header: "Завтрак",
      width: 10,
      getter: (r) => r.breakfastCount
    },
    {
      key: "lunchCount",
      header: "Обед",
      width: 10,
      getter: (r) => r.lunchCount
    },
    {
      key: "dinnerCount",
      header: "Ужин",
      width: 10,
      getter: (r) => r.dinnerCount
    },
    {
      key: "totalMealCost",
      header: "Стоимость питания",
      width: 18,
      getter: (r) => formatCurrency(r.totalMealCost),
      sum: (r) => +r.totalMealCost || 0
    }
  ]

  const livingCols = [
    {
      key: "totalLivingCost",
      header: "Стоимость проживания",
      width: 18,
      getter: (r) => formatCurrency(r.totalLivingCost),
      sum: (r) => +r.totalLivingCost || 0
    }
  ]

  const tail = [
    {
      key: "totalDebt",
      header: "Итоговая стоимость",
      width: 18,
      getter: (r) =>
        formatCurrency(
          (includeMeal ? +r.totalMealCost || 0 : 0) +
            (includeLiving ? +r.totalLivingCost || 0 : 0)
        ),
      sum: (r) =>
        (includeMeal ? +r.totalMealCost || 0 : 0) +
        (includeLiving ? +r.totalLivingCost || 0 : 0)
    },
    {
      key: "hotelName",
      header: "Гостиница",
      width: 30,
      getter: (r) => r.hotelName
    }
  ]

  const cols = [
    ...base,
    ...(includeMeal ? mealCols : []),
    ...(includeLiving ? livingCols : []),
    ...tail
  ]

  // применяем колонки в ExcelJS
  sheet.columns = cols.map((c) => ({
    key: c.key,
    width: c.width,
    style: {
      alignment: { wrapText: true, vertical: "top", horizontal: "left" }
    }
  }))

  // последняя буква колонки
  const lastCol = colLetter(cols.length)

  // заголовок-строка под шапкой
  sheet.mergeCells(`A4:${lastCol}4`)
  sheet.getCell(
    "A4"
  ).value = `РЕЕСТР № # оказанных услуг по размещению экипажа авиакомпании "${companyData.name}" в г. ${companyData.city}`
  sheet.getCell("A4").font = { name: "Times New Roman", size: 12, bold: true }
  sheet.getCell("A4").alignment = { horizontal: "left" }

  // дотягиваем правую часть шапки на 1–3 строки до конца
  sheet.mergeCells(`E1:${lastCol}1`)
  sheet.mergeCells(`E2:${lastCol}2`)
  sheet.mergeCells(`E3:${lastCol}3`)

  // ---------- рисуем строку заголовков таблицы ----------
  const headerRow = sheet.getRow(headerRowIndex)
  cols.forEach((c, i) => {
    const cell = sheet.getCell(`${colLetter(i + 1)}${headerRowIndex}`)
    cell.value = c.header
    cell.font = { ...font, bold: true }
    cell.fill = {
      type: "pattern",
      pattern: "solid",
      fgColor: { argb: "FF999999" }
    }
    cell.border = {
      top: { style: "thin" },
      left: { style: "thin" },
      bottom: { style: "thin" },
      right: { style: "thin" }
    }
  })
  headerRow.height = 40

  // ---------- строки данных ----------
  reportData.forEach((r) => {
    const rowObj = {}
    cols.forEach((c) => {
      rowObj[c.key] = c.getter ? c.getter(r) : r[c.key]
    })
    sheet.addRow(rowObj)
  })

  // ---------- итоги ----------
  const totalRowObj = {}
  totalRowObj["personPosition"] = "ИТОГО:"

  const sumForKey = (key, fn) =>
    formatCurrency(
      reportData.reduce((acc, r) => acc + (fn ? fn(r) : +r[key] || 0), 0)
    )

  const has = (key) => cols.some((c) => c.key === key)

  if (has("totalMealCost"))
    totalRowObj["totalMealCost"] = sumForKey(
      "totalMealCost",
      mealCols.find((c) => c.key === "totalMealCost")?.sum
    )
  if (has("totalLivingCost"))
    totalRowObj["totalLivingCost"] = sumForKey(
      "totalLivingCost",
      livingCols.find((c) => c.key === "totalLivingCost")?.sum
    )
  if (has("totalDebt")) {
    const totalDebtSum = reportData.reduce(
      (acc, r) =>
        acc +
        ((includeMeal ? +r.totalMealCost || 0 : 0) +
          (includeLiving ? +r.totalLivingCost || 0 : 0)),
      0
    )
    totalRowObj["totalDebt"] = formatCurrency(totalDebtSum)
  }
  sheet.addRow(totalRowObj)

  // ---------- рамки + зебра для данных ----------
  const firstDataRow = headerRowIndex + 1
  const lastDataRow = sheet.lastRow.number

  for (let rn = firstDataRow; rn <= lastDataRow; rn++) {
    const row = sheet.getRow(rn)
    const isOdd = rn % 2 === 1
    row.eachCell((cell) => {
      cell.font = font
      cell.border = {
        top: { style: "thin" },
        left: { style: "thin" },
        bottom: { style: "thin" },
        right: { style: "thin" }
      }
      if (rn !== headerRowIndex) {
        cell.fill = {
          type: "pattern",
          pattern: "solid",
          fgColor: { argb: isOdd ? "FFEEEEEE" : "FFCCCCCC" }
        }
      }
    })
  }

  // очищаем заливки и рамки в верхних строках (A1..A4)
  ;[1, 2, 3, 4].forEach((rn) => {
    const row = sheet.getRow(rn)
    row.eachCell((cell) => {
      cell.fill = {
        type: "pattern",
        pattern: "solid",
        fgColor: { argb: "FFFFFFFF" }
      }
      cell.border = {}
    })
  })

  await workbook.xlsx.writeFile(filePath)
}

export const generateExcelHotel = async (
  reportData,
  filePath,
  companyData,
  filterInput
) => {
  const includeMeal = filterInput?.meal !== false // по умолчанию: вкл
  const includeLiving = filterInput?.living !== false // по умолчанию: вкл

  const formatCurrency = (v) =>
    new Intl.NumberFormat("ru-RU", {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2
    }).format(Number(v || 0))

  const colLetter = (n) => {
    let s = ""
    while (n > 0) {
      const m = (n - 1) % 26
      s = String.fromCharCode(65 + m) + s
      n = Math.floor((n - 1) / 26)
    }
    return s
  }

  const font = { name: "Times New Roman", size: 12 }

  const wb = new ExcelJS.Workbook()
  const sheet = wb.addWorksheet(`${companyData.name}`)

  // ── Шапка
  sheet.mergeCells("A1:D1")
  sheet.mergeCells("A2:D2")
  sheet.mergeCells("A3:D3")
  sheet.getCell("A1").value = `${companyData.nameFull}`
  sheet.getCell("A1").font = { name: "Times New Roman", size: 14, bold: true }
  sheet.getCell("A1").alignment = { horizontal: "left" }

  sheet.getCell("E1").value = `${companyData.contractName}`
  sheet.getCell("E1").font = { name: "Times New Roman", size: 12, bold: true }
  sheet.getCell("E1").alignment = { horizontal: "right" }
  sheet.getCell("E2").value = " "
  sheet.getCell("E3").value = " "

  const headerRowIndex = 5

  // ── Динамическая схема колонок
  const base = [
    { key: "index", header: "п/п", width: 6, get: (r) => r.index },
    {
      key: "arrival",
      header: "Дата/время заезда",
      width: 25,
      get: (r) => r.arrival
    },
    {
      key: "departure",
      header: "Дата/время выезда",
      width: 25,
      get: (r) => r.departure
    },
    {
      key: "totalDays",
      header: "Количество суток",
      width: 18,
      get: (r) => r.totalDays
    },
    {
      key: "category",
      header: "Категория номера",
      width: 30,
      get: (r) => r.category
    },
    { key: "personName", header: "ФИО", width: 30, get: (r) => r.personName },
    { key: "roomName", header: "Комната", width: 18, get: (r) => r.roomName },
    {
      key: "shareNote",
      header: "Вид проживания",
      width: 24,
      get: (r) => r.shareNote
    }
    // {
    //   key: "personPosition",
    //   header: "Должность",
    //   width: 20,
    //   get: (r) => r.personPosition
    // }
  ]

  const mealCols = [
    {
      key: "breakfastCount",
      header: "Завтрак",
      width: 10,
      get: (r) => r.breakfastCount
    },
    { key: "lunchCount", header: "Обед", width: 10, get: (r) => r.lunchCount },
    {
      key: "dinnerCount",
      header: "Ужин",
      width: 10,
      get: (r) => r.dinnerCount
    },
    {
      key: "totalMealCost",
      header: "Стоимость питания",
      width: 18,
      get: (r) => formatCurrency(r.totalMealCost),
      sum: (r) => +r.totalMealCost || 0
    }
  ]

  const livingCols = [
    {
      key: "totalLivingCost",
      header: "Стоимость проживания",
      width: 18,
      get: (r) => formatCurrency(r.totalLivingCost),
      sum: (r) => +r.totalLivingCost || 0
    }
  ]

  const tail = [
    {
      key: "totalDebt",
      header: "Итоговая стоимость",
      width: 18,
      get: (r) =>
        formatCurrency(
          (includeMeal ? +r.totalMealCost || 0 : 0) +
            (includeLiving ? +r.totalLivingCost || 0 : 0)
        ),
      sum: (r) =>
        (includeMeal ? +r.totalMealCost || 0 : 0) +
        (includeLiving ? +r.totalLivingCost || 0 : 0)
    }
  ]

  const cols = [
    ...base,
    ...(includeMeal ? mealCols : []),
    ...(includeLiving ? livingCols : []),
    ...tail
  ]

  // Применяем колонки
  sheet.columns = cols.map((c) => ({
    key: c.key,
    width: c.width,
    style: {
      alignment: { wrapText: true, vertical: "top", horizontal: "left" }
    }
  }))

  const lastCol = colLetter(cols.length)

  // Текст под шапкой
  sheet.mergeCells(`A4:${lastCol}4`)
  sheet.getCell(
    "A4"
  ).value = `РЕЕСТР № # оказанных услуг по размещению экипажа в отеле "${companyData.name}" `
  sheet.getCell("A4").font = { name: "Times New Roman", size: 12, bold: true }
  sheet.getCell("A4").alignment = { horizontal: "left" }

  // Дотягиваем правую часть шапки
  sheet.mergeCells(`E1:${lastCol}1`)
  sheet.mergeCells(`E2:${lastCol}2`)
  sheet.mergeCells(`E3:${lastCol}3`)

  // Заголовки таблицы
  cols.forEach((c, i) => {
    const cell = sheet.getCell(`${colLetter(i + 1)}${headerRowIndex}`)
    cell.value = c.header
    cell.font = { ...font, bold: true }
    cell.fill = {
      type: "pattern",
      pattern: "solid",
      fgColor: { argb: "FF999999" }
    }
    cell.border = {
      top: { style: "thin" },
      left: { style: "thin" },
      bottom: { style: "thin" },
      right: { style: "thin" }
    }
  })
  sheet.getRow(headerRowIndex).height = 40

  // Данные
  reportData.forEach((r) => {
    const rowObj = {}
    cols.forEach((c) => (rowObj[c.key] = c.get ? c.get(r) : r[c.key]))
    sheet.addRow(rowObj)
  })

  // Итоги
  const has = (key) => cols.some((c) => c.key === key)
  const sumFor = (key, fn) =>
    formatCurrency(
      reportData.reduce((a, r) => a + (fn ? fn(r) : +r[key] || 0), 0)
    )

  const totalRow = {}
  totalRow["personPosition"] = "ИТОГО:"
  if (has("totalMealCost"))
    totalRow["totalMealCost"] = sumFor(
      "totalMealCost",
      mealCols.find((c) => c.key === "totalMealCost")?.sum
    )
  if (has("totalLivingCost"))
    totalRow["totalLivingCost"] = sumFor(
      "totalLivingCost",
      livingCols.find((c) => c.key === "totalLivingCost")?.sum
    )
  if (has("totalDebt")) {
    const sumDebt = reportData.reduce(
      (a, r) =>
        a +
        (includeMeal ? +r.totalMealCost || 0 : 0) +
        (includeLiving ? +r.totalLivingCost || 0 : 0),
      0
    )
    totalRow["totalDebt"] = formatCurrency(sumDebt)
  }
  sheet.addRow(totalRow)

  // Зебра + рамки (кроме строк 1–4)
  const firstDataRow = headerRowIndex + 1
  const lastRow = sheet.lastRow.number
  for (let rn = firstDataRow; rn <= lastRow; rn++) {
    const row = sheet.getRow(rn)
    const isOdd = rn % 2 === 1
    row.eachCell((cell) => {
      cell.font = font
      cell.border = {
        top: { style: "thin" },
        left: { style: "thin" },
        bottom: { style: "thin" },
        right: { style: "thin" }
      }
      if (rn !== headerRowIndex) {
        cell.fill = {
          type: "pattern",
          pattern: "solid",
          fgColor: { argb: isOdd ? "FFEEEEEE" : "FFCCCCCC" }
        }
      }
    })
  }

  // Чистая шапка (1–4)
  ;[1, 2, 3, 4].forEach((rn) => {
    const row = sheet.getRow(rn)
    row.eachCell((cell) => {
      cell.fill = {
        type: "pattern",
        pattern: "solid",
        fgColor: { argb: "FFFFFFFF" }
      }
      cell.border = {}
    })
  })

  await wb.xlsx.writeFile(filePath)
}

function getCellsFun(sheet, letter, num, value) {
  sheet.getCell(`${letter}${num}`).value = value
  sheet.getCell(`${letter}${num}`).font = {
    name: "Times New Roman",
    size: 14,
    bold: true
  }
  sheet.getCell(`${letter}${num}`).alignment = {
    horizontal: "left",
    vertical: "middle"
  }
}
