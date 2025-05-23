export const reverseDateTimeFormatter = (dateString, timeString) => {
  const [year, month, day] = dateString.split("-")

  const dateTimeString = `${year}-${month}-${day}T${timeString}:00`

  const date = new Date(dateTimeString)

  const seconds = Math.floor(date.getTime() / 1000)

  return seconds
}

export const dateTimeFormatter = (seconds) => {
  const date = new Date(seconds * 1000)

  const day = String(date.getDate()).padStart(2, "0")
  const month = String(date.getMonth() + 1).padStart(2, "0")
  const year = date.getFullYear()

  const dateString = `${day}.${month}.${year}`

  const hours = String(date.getHours()).padStart(2, "0")
  const minutes = String(date.getMinutes()).padStart(2, "0")

  const timeString = `${hours}:${minutes}`

  return { date: dateString, time: timeString }
}

export const formatDate = (date) => {
  const d = new Date(date)
  // Добавляем 3 часа к времени
  // d.setHours(d.getHours() + 3)
  // Форматируем дату в строку вида 'DD.MM.YYYY HH:MM'
  const options = {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false
  }
  return d.toLocaleString("ru-RU", options).replace(",", "")
}
