import { createWriteStream, existsSync, mkdirSync } from "fs"
import path from "path"

const uploadFiles = async (file) => {
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
    out.on("error", (err) => reject(err))
  })
}

export default uploadFiles
