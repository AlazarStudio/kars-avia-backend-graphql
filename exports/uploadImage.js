import { finished } from "stream/promises"
import { createWriteStream, existsSync, mkdirSync, unlinkSync } from "fs"
import path from "path"
import sharp from "sharp"

const uploadImage = async (image) => {
  const { createReadStream, filename } = await image
  const stream = createReadStream()
  const uploadsDir = path.join(process.cwd(), "uploads")

  // Создание директории, если её нет
  if (!existsSync(uploadsDir)) {
    mkdirSync(uploadsDir)
  }

  const timestamp = Date.now()
  const uniqueFilename = `${timestamp}-${path.parse(filename).name}.webp`
  const uploadPath = path.join(uploadsDir, uniqueFilename)

  // Временный файл с другим расширением
  const tempPath = path.join(uploadsDir, `${timestamp}-${filename}.tmp`)

  // Запись входного файла во временный файл
  const out = createWriteStream(tempPath)
  stream.pipe(out)
  await finished(out)

  // Обработка изображения через sharp
  await sharp(tempPath).webp({ quality: 80 }).toFile(uploadPath)

  // Удаление временного файла
  unlinkSync(tempPath)

  return `/uploads/${uniqueFilename}`
}

export default uploadImage
