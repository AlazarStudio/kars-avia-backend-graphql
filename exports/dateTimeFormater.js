const dateTimeFormatter = (dateString, timeString) => {
    
  // Разделяем строку даты на день, месяц и год
  const [day, month, year] = dateString.split(".")

  // Формируем строку в формате, который понимает конструктор Date
  // Формат: "YYYY-MM-DDTHH:MM:SS" (ISO формат)
  const dateTimeString = `${year}-${month}-${day}T${timeString}:00`

  // Создаем объект Date
  const date = new Date(dateTimeString)

  // Преобразуем в секунды
  const seconds = Math.floor(date.getTime() / 1000)

  // console.log(seconds) // Время в секундах
  return seconds
}

export default dateTimeFormatter
