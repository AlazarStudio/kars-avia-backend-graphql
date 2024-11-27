import { jsPDF } from "jspdf"
import ExcelJS from "exceljs"

// const generatePDF = (reportData, title) => {
//   const doc = new jsPDF()
//   doc.text(title, 10, 10)
//   reportData.forEach((data, index) => {
//     doc.text(
//       `${index + 1}. ${data.name} - ${data.totalCost}`,
//       10,
//       20 + index * 10
//     )
//   })
//   doc.save(`${title}.pdf`)
// }

// const generateExcel = (reportData, title) => {
//   const workbook = new ExcelJS.Workbook()
//   const sheet = workbook.addWorksheet(title)
//   sheet.columns = [
//     { header: "Name", key: "name" },
//     { header: "Total Cost", key: "totalCost" }
//   ]
//   sheet.addRows(reportData)
//   workbook.xlsx.writeFile(`${title}.xlsx`)
// }

const generatePDF = (reportData) => {
  const pdfMake = require("pdfmake")

  const docDefinition = {
    content: [{ text: "Отчёт", style: "header" }, tableContent(reportData)],
    styles: {
      header: { fontSize: 18, bold: true }
    }
  }

  const pdfDoc = pdfMake.createPdf(docDefinition)
  pdfDoc.download("report.pdf")
}

const tableContent = (data) => {
  const headers = [
    "Авиакомпания",
    "Отель",
    "Имя",
    "Проживание",
    "Питание",
    "Сборы",
    "Баланс"
  ]
  const rows = data.map((row) => [
    row.airlineName,
    row.hotelName,
    row.personName,
    row.totalLivingCost,
    row.totalMealCost,
    row.totalDispatcherFee,
    row.balance
  ])
  return [headers, ...rows]
}

export { generatePDF, generateExcel }
