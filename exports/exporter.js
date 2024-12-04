import ExcelJS from "exceljs"
import pdfMake from "pdfmake/build/pdfmake.js" // Основная библиотека
import * as pdfFonts from "pdfmake/build/vfs_fonts.js" // Шрифты
import fs from "fs"

// Настройка встроенных шрифтов
pdfMake.vfs = pdfFonts.default?.pdfMake?.vfs || pdfFonts.pdfMake?.vfs

// Формирование pdf файла. +

export const generatePDF = async (reportData, filePath) => {
  const docDefinition = {
    pageSize: "LEGAL", // Увеличенный формат страницы
    pageOrientation: "landscape", // Альбомная ориентация
    content: [
      { text: "Реестр услуг", style: "header", alignment: "center", margin: [0, 0, 0, 20] },
      {
        table: {
          headerRows: 1,
          widths: [50, 90, 100, 100, 50, 40, 40, 40, 60, 60, 60],
          body: [
            [
              { text: "Комната", bold: true, fontSize: 10 },
              { text: "Имя", bold: true, fontSize: 10 },
              { text: "Заезд", bold: true, fontSize: 10 },
              { text: "Выезд", bold: true, fontSize: 10 },
              { text: "Кол-во суток", bold: true, fontSize: 10 },
              { text: "Завтрак", bold: true, fontSize: 10 },
              { text: "Обед", bold: true, fontSize: 10 },
              { text: "Ужин", bold: true, fontSize: 10 },
              { text: "Проживание", bold: true, fontSize: 10 },
              { text: "Питание", bold: true, fontSize: 10 },
              { text: "Итог", bold: true, fontSize: 10 },
            ],
            ...reportData.map((row) => [
              { text: row.room, fontSize: 9 },
              { text: row.personName, fontSize: 9 },
              { text: row.arrival, fontSize: 9, alignment: "center" },
              { text: row.departure, fontSize: 9, alignment: "center" },
              { text: row.totalDays, fontSize: 9, alignment: "center" },
              { text: row.breakfastCount, fontSize: 9, alignment: "center" },
              { text: row.lunchCount, fontSize: 9, alignment: "center" },
              { text: row.dinnerCount, fontSize: 9, alignment: "center" },
              { text: row.totalLivingCost.toFixed(2), fontSize: 9, alignment: "right" },
              { text: row.totalMealCost.toFixed(2), fontSize: 9, alignment: "right" },
              { text: row.totalDebt.toFixed(2), fontSize: 9, alignment: "right" },
            ]),
          ],
        },
        layout: "lightHorizontalLines",
      },
      {
        text: `Итого по проживанию: ${reportData.reduce((sum, row) => sum + row.totalLivingCost, 0).toFixed(2)}`,
        margin: [0, 20, 0, 0],
        alignment: "right",
      },
      {
        text: `Итого по питанию: ${reportData.reduce((sum, row) => sum + row.totalMealCost, 0).toFixed(2)}`,
        margin: [0, 5, 0, 0],
        alignment: "right",
      },
      {
        text: `Общая сумма: ${reportData.reduce((sum, row) => sum + row.totalDebt, 0).toFixed(2)}`,
        margin: [0, 5, 0, 0],
        alignment: "right",
      },
    ],
    styles: {
      header: { fontSize: 18, bold: true },
    },
  };

  return new Promise((resolve, reject) => {
    try {
      const pdfDoc = pdfMake.createPdf(docDefinition);
      pdfDoc.getBuffer((buffer) => {
        fs.writeFileSync(filePath, buffer);
        resolve();
      });
    } catch (err) {
      reject(err);
    }
  });
};


// Формирование xlsx файла. +

export const generateExcel = async (reportData, filePath) => {
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
      arrival: row.arrival,
      departure: row.departure,
      totalDays: row.totalDays,
      breakfastCount: row.breakfastCount,
      lunchCount: row.lunchCount,
      dinnerCount: row.dinnerCount,
      totalLivingCost: row.totalLivingCost,
      totalMealCost: row.totalMealCost,
      totalDebt: row.totalDebt
    })
  })

  sheet.addRow({})
  sheet.addRow({
    room: "Итого",
    totalLivingCost: reportData.reduce(
      (sum, row) => sum + row.totalLivingCost,
      0
    ),
    totalMealCost: reportData.reduce((sum, row) => sum + row.totalMealCost, 0),
    totalDebt: reportData.reduce((sum, row) => sum + row.totalDebt, 0)
  })

  await workbook.xlsx.writeFile(filePath)
}
