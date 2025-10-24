import ExcelJS from "exceljs"
import pdfMake from "pdfmake/build/pdfmake.js"
import * as pdfFonts from "pdfmake/build/vfs_fonts.js"
import fs from "fs"

pdfMake.vfs = pdfFonts.default?.pdfMake?.vfs || pdfFonts.pdfMake?.vfs

const formatCurrency = (value) => {
  if (!value || isNaN(value)) return "0 ₽"
  return `${Number(value).toLocaleString("ru-RU")} ₽`
}

export const generateExcelAvia = async (reportData, filePath) => {
  const workbook = new ExcelJS.Workbook()

  const font = { name: "Times New Roman", size: 12 }

  const sheet = workbook.addWorksheet("Отчет по авиакомпаниям")

  // Добавляем шапку
  sheet.mergeCells("A3:D3")
  sheet.mergeCells("A2:D2")
  sheet.mergeCells("A1:D1") // Объединяем ячейки для заголовка
  sheet.getCell("A1").value = 'АО "АВИАКОМПАНИЯ АЗИМУТ"'
  sheet.getCell("A1").font = { name: "Times New Roman", size: 14, bold: true }
  sheet.getCell("A1").alignment = { horizontal: "left" }

  // sheet.mergeCells("E4:P4")
  sheet.mergeCells("E1:P1") // Объединяем ячейки для следующего текста
  sheet.getCell("E1").value = "Приложение №2"
  sheet.getCell("E1").font = { name: "Times New Roman", size: 12, bold: true }
  sheet.getCell("E1").alignment = { horizontal: "right" }

  sheet.mergeCells("E2:P2")
  sheet.getCell("E2").value = "К договору оказания услуг"
  sheet.getCell("E2").font = { name: "Times New Roman", size: 12, bold: true }
  sheet.getCell("E2").alignment = { horizontal: "right" }

  sheet.mergeCells("E3:P3")
  sheet.getCell("E3").value = "№ 001 от 01 января 2024г"
  sheet.getCell("E3").font = { name: "Times New Roman", size: 12, bold: true }
  sheet.getCell("E3").alignment = { horizontal: "right" }

  sheet.mergeCells("A4:P4")
  sheet.getCell("A4").value =
    'РЕЕСТР №14 оказанных услуг по размещению экипажа авиакомпании "АЗИМУТ "в г. Магнитогорск'
  sheet.getCell("A4").font = { name: "Times New Roman", size: 12, bold: true }
  sheet.getCell("A4").alignment = { horizontal: "left" }

  // Пустая строка после шапки
  // sheet.addRow([])

  const cells = [
    { column: "A", value: "п/п" },
    { column: "B", value: "Дата/время заезда" },
    { column: "C", value: "Дата/время выезда" },
    { column: "D", value: "Количество суток" },
    { column: "E", value: "Категория номера" },
    { column: "F", value: "ФИО" },
    { column: "G", value: "Комната" },
    { column: "H", value: "Вид проживания" },
    { column: "I", value: "Должность" },
    { column: "J", value: "Завтрак" },
    { column: "K", value: "Обед" },
    { column: "L", value: "Ужин" },
    { column: "M", value: "Стоимость питания" },
    { column: "N", value: "Стоимость проживания" },
    { column: "O", value: "Итоговая стоимость" },
    { column: "P", value: "Гостиница" }
  ]

  cells.map((item) => {
    getCellsFun(sheet, item.column, "5", item.value)
  })

  // Теперь добавляем таблицу с данными
  sheet.columns = [
    {
      key: "index",
      width: 6,
      style: {
        alignment: { wrapText: true, vertical: "top", horizontal: "left" }
      }
    },
    // { header: "id", key: "id", width: 30, style: { alignment: { wrapText: true, vertical: 'top', horizontal: 'left' } }  },
    {
      key: "arrival",
      width: 25,
      style: {
        alignment: { wrapText: true, vertical: "top", horizontal: "left" }
      }
    },
    {
      key: "departure",
      width: 25,
      style: {
        alignment: { wrapText: true, vertical: "top", horizontal: "left" }
      }
    },
    {
      key: "totalDays",
      width: 25,
      style: {
        alignment: { wrapText: true, vertical: "top", horizontal: "left" }
      }
    },
    // { header: "Full log", key: "breakdown", width: 400, style: { alignment: { wrapText: true, vertical: 'top', horizontal: 'left' } }  },
    {
      key: "category",
      width: 30,
      style: {
        alignment: { wrapText: true, vertical: "top", horizontal: "left" }
      }
    },
    {
      key: "personName",
      width: 30,
      style: {
        alignment: { wrapText: true, vertical: "top", horizontal: "left" }
      }
    },
    {
      key: "roomName",
      width: 30,
      style: {
        alignment: { wrapText: true, vertical: "top", horizontal: "left" }
      }
    },
    // { key: "roomId", width: 30, style: { alignment: { wrapText: true, vertical: 'top', horizontal: 'left' } }  },
    // { key: "price", width: 10, style: { alignment: { wrapText: true, vertical: "top", horizontal: "left" } } },
    {
      key: "shareNote",
      width: 40,
      style: {
        alignment: { wrapText: true, vertical: "top", horizontal: "left" }
      }
    },
    // { header: "Номер", key: "roomName", width: 10, style: { alignment: { wrapText: true, vertical: 'top', horizontal: 'left' } }  },
    // { header: "roommate", key: "roommateName", width: 30, style: { alignment: { wrapText: true, vertical: 'top', horizontal: 'left' } }  },
    {
      key: "personPosition",
      width: 20,
      style: {
        alignment: { wrapText: true, vertical: "top", horizontal: "left" }
      }
    },
    {
      key: "breakfastCount",
      width: 10,
      style: {
        alignment: { wrapText: true, vertical: "top", horizontal: "left" }
      }
    },
    {
      key: "lunchCount",
      width: 10,
      style: {
        alignment: { wrapText: true, vertical: "top", horizontal: "left" }
      }
    },
    {
      key: "dinnerCount",
      width: 10,
      style: {
        alignment: { wrapText: true, vertical: "top", horizontal: "left" }
      }
    },
    {
      key: "totalMealCost",
      width: 30,
      style: {
        alignment: { wrapText: true, vertical: "top", horizontal: "left" }
      }
    },
    {
      key: "totalLivingCost",
      width: 30,
      style: {
        alignment: { wrapText: true, vertical: "top", horizontal: "left" }
      }
    },
    {
      key: "totalDebt",
      width: 30,
      style: {
        alignment: { wrapText: true, vertical: "top", horizontal: "left" }
      }
    },
    {
      key: "hotelName",
      width: 30,
      style: {
        alignment: { wrapText: true, vertical: "top", horizontal: "left" }
      }
    }
  ]

  reportData.forEach((row) => {
    sheet.addRow({
      index: row.index,
      // id: row.id,
      arrival: row.arrival,
      departure: row.departure,
      totalDays: row.totalDays,
      // breakdown: row.breakdown,
      category: row.category,
      personName: row.personName,
      roomName: row.roomName,
      // roomId: row.roomId,
      shareNote: row.shareNote,
      // roommateName: row.roommateName,
      personPosition: row.personPosition,
      // price: row.price,
      // roomName: row.roomName,
      breakfastCount: row.breakfastCount,
      lunchCount: row.lunchCount,
      dinnerCount: row.dinnerCount,
      totalMealCost: formatCurrency(row.totalMealCost),
      totalLivingCost: formatCurrency(row.totalLivingCost),
      totalDebt: formatCurrency(row.totalDebt),
      hotelName: row.hotelName
    })
  })

  // sheet.addRow({}) // Пустая строка
  sheet.addRow({
    personPosition: "ИТОГО:",
    // totalDays: reportData.reduce((sum, row) => sum + row.totalDays, 0),
    // breakfastCount: reportData.reduce(
    //   (sum, row) => sum + row.breakfastCount,
    //   0
    // ),
    // lunchCount: reportData.reduce((sum, row) => sum + row.lunchCount, 0),
    // dinnerCount: reportData.reduce((sum, row) => sum + row.dinnerCount, 0),
    totalMealCost: formatCurrency(
      reportData.reduce((sum, row) => sum + row.totalMealCost, 0)
    ),
    totalLivingCost: formatCurrency(
      reportData.reduce((sum, row) => sum + row.totalLivingCost, 0)
    ),
    totalDebt: formatCurrency(
      reportData.reduce((sum, row) => sum + row.totalDebt, 0)
    )
  })

  // sheet.getColumn("index").alignment = { horizontal: "left" }
  // sheet.getColumn("totalDays").alignment = { horizontal: "left" }
  // sheet.getColumn("breakfastCount").alignment = { horizontal: "center" }
  // sheet.getColumn("lunchCount").alignment = { horizontal: "center" }
  // sheet.getColumn("dinnerCount").alignment = { horizontal: "center" }
  // sheet.getColumn("totalMealCost").alignment = { horizontal: "center" }
  // sheet.getColumn("totalLivingCost").alignment = { horizontal: "center" }
  // sheet.getColumn("totalDebt").alignment = { horizontal: "center" }

  sheet.eachRow((row) => {
    row.eachCell((cell) => {
      cell.font = {
        name: "Times New Roman",
        size: 12
      }
      cell.border = {
        top: { style: "thin" },
        left: { style: "thin" },
        bottom: { style: "thin" },
        right: { style: "thin" }
      }
      // ---------------------------------------------------------------- ↓↓↓↓
      if (row.hasValues) {
        const isOdd = row.number % 2 === 1
        const fillColor = isOdd ? "FFEEEEEE" : "FFCCCCCC"

        row.eachCell((cell) => {
          cell.font = { name: "Times New Roman", size: 12 }
          cell.border = {
            top: { style: "thin" },
            left: { style: "thin" },
            bottom: { style: "thin" },
            right: { style: "thin" }
          }
          cell.fill = {
            type: "pattern",
            pattern: "solid",
            fgColor: { argb: fillColor }
          }
        })
      }
      // ---------------------------------------------------------------- ↑↑↑↑
    })
  })

  // const headerRow = sheet.getRow(1)
  // headerRow.font = { name: "Times New Roman", size: 12, bold: true }
  // headerRow.height = 30

  // ---------------------------------------------------------------- ↓↓↓↓
  // const header = sheet.getRow(1)
  // header.font = { name: "Times New Roman", size: 12, bold: true }
  // header.height = 30
  // header.eachCell((cell) => {
  //   cell.fill = {
  //     type: "pattern",
  //     pattern: "solid",
  //     fgColor: { argb: "FF999999" }
  //   }
  // })
  // ---------------------------------------------------------------- ↑↑↑↑

  // === 4. Форматирование таблицы ===
  const headerRowIndex = 5 // шапка + пустая строка
  const headerRow = sheet.getRow(headerRowIndex)
  headerRow.font = { ...font, bold: true }
  headerRow.height = 25
  headerRow.eachCell((cell) => {
    cell.fill = {
      type: "pattern",
      pattern: "solid",
      fgColor: { argb: "FF999999" }
    }
    // cell.alignment = { horizontal: "center" }
  })

  const comp1 = sheet.getRow(1)
  const comp2 = sheet.getRow(2)
  const comp3 = sheet.getRow(3)
  const comp4 = sheet.getRow(4)

  comp1.eachCell((cell) => {
    cell.fill = {
      type: "pattern",
      pattern: "solid",
      fgColor: { argb: "FFFFFF" }
    }
    cell.border = {}
  })
  comp2.eachCell((cell) => {
    cell.fill = {
      type: "pattern",
      pattern: "solid",
      fgColor: { argb: "FFFFFF" }
    }
    cell.border = {}
  })
  comp3.eachCell((cell) => {
    cell.fill = {
      type: "pattern",
      pattern: "solid",
      fgColor: { argb: "FFFFFF" }
    }
    cell.border = {}
  })
  comp4.eachCell((cell) => {
    cell.fill = {
      type: "pattern",
      pattern: "solid",
      fgColor: { argb: "FFFFFF" }
    }
    cell.border = {}
  })

  const objectLenght = Object.keys(reportData).length
  sheet.mergeCells(`A${objectLenght + 8}:C${objectLenght + 8}`)
  sheet.getCell(`A${objectLenght + 8}`).value =
    'Генеральный директор ООО "КАРС АВИА"'
  sheet.getCell(`A${objectLenght + 8}`).font = {
    name: "Times New Roman",
    size: 12
    // bold: true
  }
  sheet.getCell(`A${objectLenght + 8}`).alignment = { horizontal: "left" }
  sheet.getCell(`A${objectLenght + 8}`).fill = {
    type: "pattern",
    pattern: "solid",
    fgColor: { argb: "FFFFFF" }
  }

  sheet.mergeCells(`A${objectLenght + 9}:C${objectLenght + 9}`)
  sheet.mergeCells(`A${objectLenght + 10}:C${objectLenght + 10}`)
  sheet.getCell(`A${objectLenght + 10}`).value =
    "______________________ Пятигорский Е.К."
  sheet.getCell(`A${objectLenght + 10}`).font = {
    name: "Times New Roman",
    size: 12
    // bold: true
  }
  sheet.getCell(`A${objectLenght + 10}`).alignment = { horizontal: "left" }
  sheet.getCell(`A${objectLenght + 10}`).fill = {
    type: "pattern",
    pattern: "solid",
    fgColor: { argb: "FFFFFF" }
  }

  await workbook.xlsx.writeFile(filePath)
}

export const generateExcelHotel = async (reportData, filePath) => {
  const workbook = new ExcelJS.Workbook()
  const sheet = workbook.addWorksheet("Развёрнутый отчёт")

  sheet.columns = [
    { header: "п/п", key: "index", width: 6 },
    { header: "Номер", key: "roomName", width: 15 },
    { header: "ФИО", key: "personName", width: 30 },
    { header: "Дата/время заезда", key: "arrival", width: 25 },
    { header: "Дата/время выезда", key: "departure", width: 25 },
    { header: "кол-во суток", key: "totalDays", width: 10 },
    { header: "Категория ном.", key: "category", width: 30 },
    // { header: "Должность", key: "personPosition", width: 20 },
    { header: "Завтрак", key: "breakfastCount", width: 10 },
    { header: "Обед", key: "lunchCount", width: 10 },
    { header: "Ужин", key: "dinnerCount", width: 10 },
    { header: "Стоимость питания", key: "totalMealCost", width: 20 },
    { header: "Стоимость проживания", key: "totalLivingCost", width: 20 },
    { header: "Итоговая стоимость", key: "totalDebt", width: 20 }
  ]

  reportData.forEach((row) => {
    sheet.addRow({
      index: row.index,
      arrival: row.arrival,
      departure: row.departure,
      totalDays: row.totalDays,
      category: row.category,
      personName: row.personName,
      personPosition: row.personPosition,
      roomName: row.roomName,
      breakfastCount: row.breakfastCount,
      lunchCount: row.lunchCount,
      dinnerCount: row.dinnerCount,
      totalMealCost: formatCurrency(row.totalMealCost),
      totalLivingCost: formatCurrency(row.totalLivingCost),
      totalDebt: formatCurrency(row.totalDebt)
    })
  })

  sheet.addRow({})
  sheet.addRow({
    breakfastCount: "ИТОГО",
    // totalDays: reportData.reduce((sum, row) => sum + row.totalDays, 0),
    // breakfastCount: reportData.reduce(
    //   (sum, row) => sum + row.breakfastCount,
    //   0
    // ),
    // lunchCount: reportData.reduce((sum, row) => sum + row.lunchCount, 0),
    // dinnerCount: reportData.reduce((sum, row) => sum + row.dinnerCount, 0),
    totalMealCost: formatCurrency(
      reportData.reduce((sum, row) => sum + row.totalMealCost, 0)
    ),
    totalLivingCost: formatCurrency(
      reportData.reduce((sum, row) => sum + row.totalLivingCost, 0)
    ),
    totalDebt: formatCurrency(
      reportData.reduce((sum, row) => sum + row.totalDebt, 0)
    )
  })

  sheet.getColumn("index").alignment = { horizontal: "left" }
  sheet.getColumn("totalDays").alignment = { horizontal: "left" }
  sheet.getColumn("breakfastCount").alignment = { horizontal: "center" }
  sheet.getColumn("lunchCount").alignment = { horizontal: "center" }
  sheet.getColumn("dinnerCount").alignment = { horizontal: "center" }
  sheet.getColumn("totalMealCost").alignment = { horizontal: "center" }
  sheet.getColumn("totalLivingCost").alignment = { horizontal: "center" }
  sheet.getColumn("totalDebt").alignment = { horizontal: "center" }

  sheet.eachRow((row) => {
    row.eachCell((cell) => {
      cell.font = {
        name: "Times New Roman",
        size: 12
      }
    })
  })

  await workbook.xlsx.writeFile(filePath)
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
