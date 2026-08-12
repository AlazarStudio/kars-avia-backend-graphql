import ExcelJS from "exceljs"
import {
  buildReportPresentation,
  presentationToExcelRows
} from "./reportPresentation.js"

const colLetter = (n) => {
  let s = ""
  while (n > 0) {
    const m = (n - 1) % 26
    s = String.fromCharCode(65 + m) + s
    n = Math.floor((n - 1) / 26)
  }
  return s
}

const writeStyledWorkbook = async ({
  sheetName,
  filePath,
  presentation,
  headerRowIndex = 5
}) => {
  const font = { name: "Times New Roman", size: 12 }
  const workbook = new ExcelJS.Workbook()
  const sheet = workbook.addWorksheet(sheetName)
  const { columns, header, dataRows, totalsRow } = presentation
  const { dataRows: excelDataRows, totalsRow: excelTotalsRow } =
    presentationToExcelRows(presentation)

  sheet.mergeCells("A1:D1")
  sheet.mergeCells("A2:D2")
  sheet.mergeCells("A3:D3")
  sheet.getCell("A1").value = header.companyNameFull
  sheet.getCell("A1").font = { name: "Times New Roman", size: 14, bold: true }
  sheet.getCell("A1").alignment = { horizontal: "left" }

  sheet.getCell("E1").value = header.contractName
  sheet.getCell("E1").font = { name: "Times New Roman", size: 12, bold: true }
  sheet.getCell("E1").alignment = { horizontal: "right" }
  sheet.getCell("E2").value = " "
  sheet.getCell("E3").value = " "

  sheet.columns = columns.map((c) => ({
    key: c.key,
    width: c.width,
    style: {
      alignment: { wrapText: true, vertical: "top", horizontal: "left" }
    }
  }))

  const lastCol = colLetter(columns.length)

  sheet.mergeCells(`A4:${lastCol}4`)
  sheet.getCell("A4").value = header.title
  sheet.getCell("A4").font = { name: "Times New Roman", size: 12, bold: true }
  sheet.getCell("A4").alignment = { horizontal: "left" }

  sheet.mergeCells(`E1:${lastCol}1`)
  sheet.mergeCells(`E2:${lastCol}2`)
  sheet.mergeCells(`E3:${lastCol}3`)

  columns.forEach((c, i) => {
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

  excelDataRows.forEach((rowObj) => sheet.addRow(rowObj))
  if (excelTotalsRow) sheet.addRow(excelTotalsRow)

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
  return { columns, dataRows, totalsRow }
}

export const generateExcelAvia = async (
  reportData,
  filePath,
  companyData,
  filterInput
) => {
  const presentation = buildReportPresentation({
    type: "AIRLINE",
    rows: reportData,
    companyData,
    createFilterInput: filterInput
  })
  await writeStyledWorkbook({
    sheetName: `${companyData.name}`,
    filePath,
    presentation
  })
}

export const generateExcelHotel = async (
  reportData,
  filePath,
  companyData,
  filterInput
) => {
  const presentation = buildReportPresentation({
    type: "HOTEL",
    rows: reportData,
    companyData,
    createFilterInput: filterInput
  })
  await writeStyledWorkbook({
    sheetName: `${companyData.name}`,
    filePath,
    presentation
  })
}
