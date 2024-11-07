export const reverseDateTimeFormatter = (dateString, timeString) => {
  const [day, month, year] = dateString.split(".")

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
