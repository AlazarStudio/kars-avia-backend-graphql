import ExcelJS from "exceljs"
import path from "path"
import fs from "fs"

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
