import { finished } from "stream/promises"
import { createWriteStream, existsSync, mkdirSync } from "fs"
import path from "path"
import sharp from "sharp"

const uploadImage = async (image) => {
  const { createReadStream, filename } = await image
  const stream = createReadStream()
  const uploadsDir = path.join(process.cwd(), "uploads")

  // Создание директории, если она не существует
  if (!existsSync(uploadsDir)) {
    mkdirSync(uploadsDir)
  }

  const uniqueFilename = `${Date.now()}-${path.parse(filename).name}.webp`
  const uploadPath = path.join(uploadsDir, uniqueFilename)

  // Создаём временный поток для обработки изображения
  const tempPath = path.join(uploadsDir, `${Date.now()}-${filename}`)
  const out = createWriteStream(tempPath)
  stream.pipe(out)
  await finished(out)

  // Используем sharp для сжатия и конвертации в webp
  await sharp(tempPath)
    .webp({ quality: 80 }) // Настройка качества сжатия (80 - оптимальный вариант)
    .toFile(uploadPath)

  // Удаление временного файла, если нужно (например, через fs.unlinkSync)
  // import { unlinkSync } from "fs";
  // unlinkSync(tempPath);

  return `/uploads/${uniqueFilename}`
}

export default uploadImage
