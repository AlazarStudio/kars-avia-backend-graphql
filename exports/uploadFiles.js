import { finished } from "stream/promises"
import { createWriteStream, existsSync, mkdirSync } from "fs"
import { promises as fsPromises } from "fs"
import path from "path"
import sharp from "sharp"

export const uploadFiles = async (file) => {
  const { createReadStream, filename } = await file
  const stream = createReadStream()
  const uploadsDir = path.join(process.cwd(), "uploads")

  // Если директория не существует, создаём её
  if (!existsSync(uploadsDir)) {
    mkdirSync(uploadsDir)
  }

  // Формируем уникальное имя файла, сохраняя оригинальное расширение
  const timestamp = Date.now()
  const { name, ext } = path.parse(filename)
  const uniqueFilename = `${timestamp}-${name}${ext}`
  const uploadPath = path.join(uploadsDir, uniqueFilename)

  // Возвращаем промис, который резолвится, когда файл успешно записан
  return new Promise((resolve, reject) => {
    const out = createWriteStream(uploadPath)
    stream.pipe(out)
    out.on("finish", () => resolve(`/uploads/${uniqueFilename}`))
    // out.on("error", (err) => reject(err))
    out.on("error", (err) => {
      console.error("Error writing file:", err)
      reject(err) // Отправка ошибки в промис
    })
  })
}

export const deleteFiles = async (filePath) => {
  // Преобразуем относительный путь в абсолютный
  const absolutePath = path.join(process.cwd(), filePath)
  try {
    await fsPromises.unlink(absolutePath)
    // console.log(`Файл ${absolutePath} успешно удалён.`)
  } catch (error) {
    console.error(`Ошибка при удалении файла ${absolutePath}:`, error)
    // При необходимости можно пробросить ошибку или проигнорировать её
  }
}
