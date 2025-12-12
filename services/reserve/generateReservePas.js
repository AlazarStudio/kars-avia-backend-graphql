import pdfFonts from "pdfmake/build/vfs_fonts.js"
import PdfPrinter from "pdfmake"
import ExcelJS from "exceljs"
import path from "path"
import fs from "fs"

pdfMake.vfs = pdfFonts.pdfMake?.vfs || pdfFonts.default?.pdfMake?.vfs

const printer = new PdfPrinter(
  pdfFonts.pdfMake?.fonts || pdfFonts.default?.pdfMake?.fonts
)

export const generateReservePdf = async (reserveData, filePath) => {
  const content = []

  if (!reserveData || !reserveData.hotel || reserveData.hotel.length === 0) {
    throw new Error("Данные о резерве отсутствуют")
  }

  reserveData.hotel.forEach((hotelItem) => {
    const hotelName = hotelItem.hotel?.name || "Название не указано"
    const hotelAddress =
      hotelItem.hotel?.information?.address || "Адрес не указан"
    const capacity = hotelItem.capacity ?? "Не указано"

    content.push({ text: `Отель: ${hotelName}`, style: "header" })
    content.push({ text: `Адрес: ${hotelAddress}`, style: "subheader" })
    content.push({ text: `Вместимость: ${capacity}`, style: "subheader" })

    // Таблица пассажиров
    const passengerTable = {
      table: {
        headerRows: 1,
        widths: ["*", "*", "*"],
        body: [
          [
            { text: "Имя", style: "tableHeader" },
            { text: "Номер", style: "tableHeader" },
            { text: "Пол", style: "tableHeader" }
          ]
        ]
      }
    }

    if (hotelItem.passengers && hotelItem.passengers.length > 0) {
      hotelItem.passengers.forEach((passenger) => {
        passengerTable.table.body.push([
          passenger.name || "Не указано",
          passenger.number || "Не указано",
          passenger.gender || "Не указано"
        ])
      })
    } else {
      passengerTable.table.body.push([
        { text: "Нет пассажиров", colSpan: 3, alignment: "center" }
      ])
    }

    content.push(passengerTable)
    content.push({ text: "\n" }) // Отступ между отелями
  })

  const docDefinition = {
    content,
    styles: {
      header: { fontSize: 16, bold: true, margin: [0, 10, 0, 5] },
      subheader: { fontSize: 12, margin: [0, 5, 0, 5] },
      tableHeader: { bold: true, fontSize: 12, fillColor: "#CCCCCC" }
    }
  }

  return new Promise((resolve, reject) => {
    const pdfDoc = printer.createPdfKitDocument(docDefinition)
    const writeStream = fs.createWriteStream(filePath)

    pdfDoc.pipe(writeStream)
    pdfDoc.end()

    writeStream.on("finish", () => resolve(filePath))
    writeStream.on("error", reject)
  })
}

export const generateReserveExcel = async (reserveData, filePath) => {
  const workbook = new ExcelJS.Workbook()
  const sheet = workbook.addWorksheet("Данные о резерве")

  // Заголовки
  sheet.columns = [
    { header: "Название отеля", key: "hotelName", width: 30 },
    { header: "Адрес", key: "address", width: 40 },
    { header: "Вместимость", key: "capacity", width: 15 },
    { header: "Пассажир", key: "passengerName", width: 20 },
    { header: "Номер", key: "passengerNumber", width: 20 },
    { header: "Пол", key: "passengerGender", width: 15 }
  ]

  // **Проверяем, есть ли данные о резервации**
  if (!reserveData || !reserveData.hotel || reserveData.hotel.length === 0) {
    throw new Error("Данные о резерве отсутствуют или неверно получены.")
  }

  // **Перебираем отели**
  reserveData.hotel.forEach((hotelItem) => {
    const hotelName = hotelItem.hotel?.name || "Название не указано"
    const hotelAddress =
      hotelItem.hotel?.information?.address || "Адрес не указан"
    const capacity = hotelItem.capacity ?? "Не указано"

    // **Перебираем пассажиров**
    if (hotelItem.passengers && hotelItem.passengers.length > 0) {
      hotelItem.passengers.forEach((passenger, index) => {
        sheet.addRow({
          hotelName: index === 0 ? hotelName : "",
          address: index === 0 ? hotelAddress : "",
          capacity: index === 0 ? capacity : "",
          passengerName: passenger.name || "Не указано",
          passengerNumber: passenger.number || "Не указано",
          passengerGender: passenger.gender || "Не указано"
        })
      })
    } else {
      sheet.addRow({
        hotelName,
        address: hotelAddress,
        capacity,
        passengerName: "Нет пассажиров",
        passengerNumber: "",
        passengerGender: ""
      })
    }

    // Добавляем пустую строку для разделения отелей
    sheet.addRow({})
  })

  // **Сохраняем файл**
  await workbook.xlsx.writeFile(filePath)
  return filePath
}
