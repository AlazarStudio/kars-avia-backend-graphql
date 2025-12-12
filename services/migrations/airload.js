import xlsx from "xlsx"
import { prisma } from "../../prisma.js"

async function loadAirlinePersonnelFromExcel(filePath) {
  // Читаем Excel-файл
  const workbook = xlsx.readFile(filePath)
  // Берем первый лист
  const sheetName = workbook.SheetNames[0]
  const worksheet = workbook.Sheets[sheetName]

  // Преобразуем лист в массив объектов
  // Параметр defval: '' устанавливает значение по умолчанию для пустых ячеек
  const data = xlsx.utils.sheet_to_json(worksheet, { defval: "" })

  // Преобразуем строки в формат, подходящий для базы данных
  const personnel = data.map((row) => ({
    name: row["ФИО"]?.toString().trim() || "",
    number: row["Телефон"]?.toString().trim() || "",
    position: row["Должность"]?.toString().trim() || "",
    gender: row["Пол"]?.toString().trim() || "",
    airlineId: "67af473ff18c7be5412e57fb"
  }))

  // Выводим в консоль, сколько записей обнаружено (для отладки)
  console.log(`Найдено ${personnel.length} записей.`)

  // Загружаем записи в базу данных
  // Используем createMany для вставки нескольких записей за один запрос
  const result = await prisma.airlinePersonal.createMany({
    data: personnel,
  })

  console.log(`Загружено ${result.count} записей в базу данных.`)
}

// Укажите путь к вашему файлу Excel
const filePath = "azim.xlsx"

loadAirlinePersonnelFromExcel(filePath)
  .then(() => {
    console.log("Загрузка данных завершена.")
    process.exit(0)
  })
  .catch((err) => {
    console.error("Ошибка при загрузке данных:", err)
    process.exit(1)
  })
