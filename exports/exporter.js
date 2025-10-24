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
  sheet.mergeCells("A3:F3")
  sheet.mergeCells("A2:F2")
  sheet.mergeCells("A1:F1") // Объединяем ячейки для заголовка
  sheet.getCell("A1").value = 'АО "АВИАКОМПАНИЯ АЗИМУТ"'
  sheet.getCell("A1").font = { name: "Times New Roman", size: 14, bold: true }
  sheet.getCell("A1").alignment = { horizontal: "left" }

  sheet.mergeCells("G4:M4")
  sheet.mergeCells("G1:M1") // Объединяем ячейки для следующего текста
  sheet.getCell("G1").value = "Приложение №2"
  sheet.getCell("G1").font = { name: "Times New Roman", size: 12, bold: true }
  sheet.getCell("G1").alignment = { horizontal: "right" }

  sheet.mergeCells("G2:M2")
  sheet.getCell("G2").value = "К договору оказания услуг"
  sheet.getCell("G2").font = { name: "Times New Roman", size: 12, bold: true }
  sheet.getCell("G2").alignment = { horizontal: "right" }

  sheet.mergeCells("G3:M3")
  sheet.getCell("G3").value = "№ 001 от 01 января 2024г"
  sheet.getCell("G3").font = { name: "Times New Roman", size: 12, bold: true }
  sheet.getCell("G3").alignment = { horizontal: "right" }

  sheet.mergeCells("A4:F4")
  sheet.getCell("A4").value =
    'РЕЕСТР №14 оказанных услуг по размещению экипажа авиакомпании "АЗИМУТ "в г. Магнитогорск'
  sheet.getCell("A4").font = { name: "Times New Roman", size: 12, bold: true }
  sheet.getCell("A4").alignment = { horizontal: "left" }

  // Пустая строка после шапки
  sheet.addRow([])
  sheet.addRow([])

  sheet.getCell("A6").value = "п/п"
  sheet.getCell("A6").font = { name: "Times New Roman", size: 14, bold: true }
  sheet.getCell("A6").alignment = { horizontal: "left", vertical: "middle" }

  sheet.getCell("B6").value = "Дата/время заезда"
  sheet.getCell("B6").font = { name: "Times New Roman", size: 14, bold: true }
  sheet.getCell("B6").alignment = { horizontal: "left", vertical: "middle" }

  sheet.getCell("C6").value = "Дата/время выезда"
  sheet.getCell("C6").font = { name: "Times New Roman", size: 14, bold: true }
  sheet.getCell("C6").alignment = { horizontal: "left", vertical: "middle" }

  sheet.getCell("D6").value = "Количество суток"
  sheet.getCell("D6").font = { name: "Times New Roman", size: 14, bold: true }
  sheet.getCell("D6").alignment = { horizontal: "left", vertical: "middle" }

  sheet.getCell("E6").value = "Категория номера"
  sheet.getCell("E6").font = { name: "Times New Roman", size: 14, bold: true }
  sheet.getCell("E6").alignment = { horizontal: "left", vertical: "middle" }

  sheet.getCell("F6").value = "ФИО"
  sheet.getCell("F6").font = { name: "Times New Roman", size: 14, bold: true }
  sheet.getCell("F6").alignment = { horizontal: "left", vertical: "middle" }

  sheet.getCell("G6").value = "Комната"
  sheet.getCell("G6").font = { name: "Times New Roman", size: 14, bold: true }
  sheet.getCell("G6").alignment = { horizontal: "left", vertical: "middle" }

  // sheet.getCell("H6").value = "Цена"
  // sheet.getCell("H6").font = { name: "Times New Roman", size: 14, bold: true }
  // sheet.getCell("H6").alignment = { horizontal: "left", vertical: "middle" }

  sheet.getCell("H6").value = "Вид проживания"
  sheet.getCell("H6").font = { name: "Times New Roman", size: 14, bold: true }
  sheet.getCell("H6").alignment = { horizontal: "left", vertical: "middle" }

  sheet.getCell("I6").value = "Должность"
  sheet.getCell("I6").font = { name: "Times New Roman", size: 14, bold: true }
  sheet.getCell("I6").alignment = { horizontal: "left", vertical: "middle" }

  sheet.getCell("J6").value = "Завтрак"
  sheet.getCell("J6").font = { name: "Times New Roman", size: 14, bold: true }
  sheet.getCell("J6").alignment = { horizontal: "left", vertical: "middle" }

  sheet.getCell("K6").value = "Обед"
  sheet.getCell("K6").font = { name: "Times New Roman", size: 14, bold: true }
  sheet.getCell("K6").alignment = { horizontal: "left", vertical: "middle" }

  sheet.getCell("L6").value = "Ужин"
  sheet.getCell("L6").font = { name: "Times New Roman", size: 14, bold: true }
  sheet.getCell("L6").alignment = { horizontal: "left", vertical: "middle" }

  sheet.getCell("M6").value = "Стоимость питания"
  sheet.getCell("M6").font = { name: "Times New Roman", size: 14, bold: true }
  sheet.getCell("M6").alignment = { horizontal: "left", vertical: "middle" }

  sheet.getCell("N6").value = "Стоимость проживания"
  sheet.getCell("N6").font = { name: "Times New Roman", size: 14, bold: true }
  sheet.getCell("N6").alignment = { horizontal: "left", vertical: "middle" }

  sheet.getCell("O6").value = "Итоговая стоимость"
  sheet.getCell("O6").font = { name: "Times New Roman", size: 14, bold: true }
  sheet.getCell("O6").alignment = { horizontal: "left", vertical: "middle" }

  sheet.getCell("P6").value = "Гостиница"
  sheet.getCell("P6").font = { name: "Times New Roman", size: 14, bold: true }
  sheet.getCell("P6").alignment = { horizontal: "left", vertical: "middle" }

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

  sheet.addRow({}) // Пустая строка
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
  const headerRowIndex = 6 // шапка + пустая строка
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
    cell.alignment = { horizontal: "center" }
  })
  comp2.eachCell((cell) => {
    cell.fill = {
      type: "pattern",
      pattern: "solid",
      fgColor: { argb: "FFFFFF" }
    }
    cell.alignment = { horizontal: "center" }
  })
  comp3.eachCell((cell) => {
    cell.fill = {
      type: "pattern",
      pattern: "solid",
      fgColor: { argb: "FFFFFF" }
    }
    cell.alignment = { horizontal: "center" }
  })
  comp4.eachCell((cell) => {
    cell.fill = {
      type: "pattern",
      pattern: "solid",
      fgColor: { argb: "FFFFFF" }
    }
    cell.alignment = { horizontal: "center" }
  })

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

function getCellsFun(letter, value) {
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
