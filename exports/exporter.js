import ExcelJS from "exceljs"
import pdfMake from "pdfmake/build/pdfmake.js"
import * as pdfFonts from "pdfmake/build/vfs_fonts.js"
import fs from "fs"

// Настройка шрифтов для pdfMake
pdfMake.vfs = pdfFonts.default?.pdfMake?.vfs || pdfFonts.pdfMake?.vfs

// Функция для форматирования чисел
const formatCurrency = (value) => {
  return `${value.toString().replace(/\B(?=(\d{3})+(?!\d))/g, " ")} ₽`
}

// Функция для удаления секунд из дат
const formatDateWithoutSeconds = (date) => {
  return new Date(date).toLocaleString("ru-RU", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit"
  })
}

// Функция для вычисления ширины колонок
const calculateColumnWidths = (reportData, headers) => {
  const maxWidths = headers.map((header) => header.text.length) // Изначально длины заголовков
  reportData.forEach((row) => {
    headers.forEach((header, index) => {
      const cellLength = (row[header.key] || "").toString().length
      maxWidths[index] = Math.max(maxWidths[index], cellLength)
    })
  })
  return maxWidths.map((width) => width * 7) // Умножение для пропорциональной ширины
}

export const generatePDF = async (reportData, filePath) => {
  const headers = [
    { text: "Комната", key: "room" },
    { text: "Имя", key: "personName" },
    { text: "Заезд", key: "arrival" },
    { text: "Выезд", key: "departure" },
    { text: "Кол-во суток", key: "totalDays" },
    { text: "Завтрак", key: "breakfastCount" },
    { text: "Обед", key: "lunchCount" },
    { text: "Ужин", key: "dinnerCount" },
    { text: "Проживание", key: "totalLivingCost" },
    { text: "Питание", key: "totalMealCost" },
    { text: "Итог", key: "totalDebt" }
  ]

  // Вычисляем ширину колонок
  const columnWidths = calculateColumnWidths(reportData, headers)

  const docDefinition = {
    pageSize: "A3",
    pageOrientation: "landscape",
    content: [
      {
        text: "Реестр услуг",
        style: "header",
        alignment: "center",
        margin: [0, 0, 0, 20]
      },
      {
        table: {
          headerRows: 1,
          widths: columnWidths,
          body: [
            headers.map((header) => ({
              text: header.text,
              bold: true,
              fontSize: 10
            })),
            ...reportData.map((row) =>
              headers.map((header) => {
                const value = row[header.key]
                if (header.key === "arrival" || header.key === "departure") {
                  return {
                    text: formatDateWithoutSeconds(value || "Не указано"),
                    fontSize: 8,
                    alignment: "center"
                  }
                }
                if (
                  header.key === "totalLivingCost" ||
                  header.key === "totalMealCost" ||
                  header.key === "totalDebt"
                ) {
                  return {
                    text: formatCurrency(value || 0),
                    fontSize: 8,
                    alignment: "right"
                  }
                }
                return {
                  text: value?.toString() || "Не указано",
                  fontSize: 8,
                  alignment: "center"
                }
              })
            )
          ]
        },
        layout: "lightHorizontalLines"
      },
      {
        text: `Итого по проживанию: ${formatCurrency(
          reportData.reduce((sum, row) => sum + row.totalLivingCost, 0)
        )}`,
        margin: [0, 20, 0, 0],
        alignment: "right"
      },
      {
        text: `Итого по питанию: ${formatCurrency(
          reportData.reduce((sum, row) => sum + row.totalMealCost, 0)
        )}`,
        margin: [0, 5, 0, 0],
        alignment: "right"
      },
      {
        text: `Общая сумма: ${formatCurrency(
          reportData.reduce((sum, row) => sum + row.totalDebt, 0)
        )}`,
        margin: [0, 5, 0, 0],
        alignment: "right"
      }
    ],
    styles: {
      header: { fontSize: 20, bold: true }
    }
  }

  return new Promise((resolve, reject) => {
    try {
      const pdfDoc = pdfMake.createPdf(docDefinition)
      pdfDoc.getBuffer((buffer) => {
        fs.writeFileSync(filePath, buffer)
        resolve()
      })
    } catch (err) {
      reject(err)
    }
  })
}

// Формирование xlsx файла. +
export const generateExcelAvia = async (reportData, filePath) => {
  const workbook = new ExcelJS.Workbook()
  const sheet = workbook.addWorksheet("Реестр услуг")

  sheet.columns = [
    { header: "Комната", key: "room", width: 15 },
    { header: "Имя", key: "personName", width: 20 },
    { header: "Заезд", key: "arrival", width: 20 },
    { header: "Выезд", key: "departure", width: 20 },
    { header: "Кол-во суток", key: "totalDays", width: 15 },
    { header: "Завтрак", key: "breakfastCount", width: 10 },
    { header: "Обед", key: "lunchCount", width: 10 },
    { header: "Ужин", key: "dinnerCount", width: 10 },
    { header: "Проживание", key: "totalLivingCost", width: 15 },
    { header: "Питание", key: "totalMealCost", width: 15 },
    { header: "Итог", key: "totalDebt", width: 15 }
  ]

  reportData.forEach((row) => {
    sheet.addRow({
      room: row.room,
      personName: row.personName,
      arrival: row.arrival ? row.arrival : "Не указано",
      // arrival: row.arrival ? formatDateWithoutSeconds(row.arrival) : "Не указано",
      departure: row.departure ? row.departure : "Не указано",
      // departure: row.departure ? formatDateWithoutSeconds(row.departure) : "Не указано",
      totalDays: row.totalDays,
      breakfastCount: row.breakfastCount,
      lunchCount: row.lunchCount,
      dinnerCount: row.dinnerCount,
      totalLivingCost: formatCurrency(row.totalLivingCost),
      totalMealCost: formatCurrency(row.totalMealCost),
      totalDebt: formatCurrency(row.totalDebt)
    })
  })

  sheet.addRow({})
  sheet.addRow({
    room: "Итого",
    totalLivingCost: formatCurrency(
      reportData.reduce((sum, row) => sum + row.totalLivingCost, 0)
    ),
    totalMealCost: formatCurrency(
      reportData.reduce((sum, row) => sum + row.totalMealCost, 0)
    ),
    totalDebt: formatCurrency(
      reportData.reduce((sum, row) => sum + row.totalDebt, 0)
    )
  })

  await workbook.xlsx.writeFile(filePath)
}

export const generateExcelHotel = async (reportData, filePath) => {
  const workbook = new ExcelJS.Workbook()
  const sheet = workbook.addWorksheet("Отчёт по комнатам")

  sheet.columns = [
    { header: "Комната", key: "roomName", width: 20 },
    { header: "Категория", key: "category", width: 15 },
    { header: "Кол-во дней", key: "daysInRange", width: 15 },
    { header: "Цена за день", key: "dailyPrice", width: 15 },
    { header: "Итоговая стоимость", key: "totalCost", width: 20 }
  ]

  reportData.forEach((row) => {
    sheet.addRow({
      roomName: row.roomName,
      category: row.category,
      daysInRange: row.daysInRange,
      dailyPrice: row.dailyPrice,
      totalCost: row.totalCost
    })
  })

  await workbook.xlsx.writeFile(filePath)
}
