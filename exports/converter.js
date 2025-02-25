import ExcelJS from "exceljs"
import pdfMake from "pdfmake/build/pdfmake.js"
import * as pdfFonts from "pdfmake/build/vfs_fonts.js"
import fs from "fs"
import path from "path"

pdfMake.vfs = pdfFonts.pdfMake.vfs

export const convertXlsxToPdf = async (xlsxFilePath, pdfFilePath) => {
  const workbook = new ExcelJS.Workbook()
  await workbook.xlsx.readFile(xlsxFilePath)

  const worksheet = workbook.worksheets[0] // Берем первый лист
  const tableBody = []
  let columnWidths = []

  // Извлекаем заголовки таблицы
  worksheet.eachRow((row, rowNumber) => {
    const rowData = []
    row.eachCell((cell, colNumber) => {
      rowData.push({
        text: cell.value?.toString() || "",
        bold: rowNumber === 1, // Жирный шрифт для заголовков
        alignment: "center",
        fontSize: 10
      })

      // Запоминаем ширину колонок (если это первая строка)
      if (rowNumber === 1) {
        columnWidths[colNumber - 1] = cell.width ? cell.width * 5 : "auto"
      }
    })
    tableBody.push(rowData)
  })

  // Определяем PDF-структуру
  const pdfContent = {
    content: [
      {
        text: "Отчет",
        style: "header",
        alignment: "center",
        margin: [0, 10, 0, 20]
      },
      {
        table: {
          headerRows: 1,
          widths: columnWidths,
          body: tableBody
        }
      }
    ],
    styles: {
      header: { fontSize: 16, bold: true },
      tableHeader: { fontSize: 12, bold: true, fillColor: "#CCCCCC" }
    }
  }

  // Генерируем PDF и сохраняем на сервере
  return new Promise((resolve, reject) => {
    const pdfDoc = pdfMake.createPdf(pdfContent)
    pdfDoc.getBuffer((buffer) => {
      fs.writeFile(pdfFilePath, buffer, (err) => {
        if (err) reject(err)
        else resolve(pdfFilePath)
      })
    })
  })
}

/*

import { convertXlsxToPdf } from "../../exports/exporter.js";

Mutation: {
  createAirlineReport: async (_, { input }, context) => {
    const { user } = context;
    airlineAdminMiddleware(context);
    const { filter, format } = input;

    if (!user) {
      throw new Error("Access denied");
    }

    const filterStart = new Date(filter.startDate);
    const filterEnd = new Date(filter.endDate);
    const startDateStr = filterStart.toISOString().slice(0, 10);
    const endDateStr = filterEnd.toISOString().slice(0, 10);

    const reportData = await generateReportData(filter);
    
    const reportName = `airline_report_${startDateStr}-${endDateStr}_${Date.now()}`;
    const reportXlsxPath = path.resolve(`./reports/${reportName}.xlsx`);
    const reportPdfPath = path.resolve(`./reports/${reportName}.pdf`);
    
    fs.mkdirSync(path.dirname(reportXlsxPath), { recursive: true });

    // Генерация XLSX
    await generateExcelAvia(reportData, reportXlsxPath);

    if (format === "pdf") {
      await convertXlsxToPdf(reportXlsxPath, reportPdfPath);
      return {
        name: `${reportName}.pdf`,
        url: `/reports/${reportName}.pdf`
      };
    } else {
      return {
        name: `${reportName}.xlsx`,
        url: `/reports/${reportName}.xlsx`
      };
    }
  }
}


*/
