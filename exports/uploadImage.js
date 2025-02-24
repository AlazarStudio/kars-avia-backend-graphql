import { finished } from "stream/promises"
import { createWriteStream, existsSync, mkdirSync } from "fs"
import { promises as fsPromises } from "fs"
import path from "path"
import sharp from "sharp"

// export const uploadImage = async (image) => {
//   const { createReadStream, filename } = await image;
//   const stream = createReadStream();
//   const uploadsDir = path.join(process.cwd(), "uploads");

//   if (!existsSync(uploadsDir)) {
//     mkdirSync(uploadsDir);
//   }

//   const timestamp = Date.now();
//   const uniqueFilename = `${timestamp}-${path.parse(filename).name}.webp`;
//   const uploadPath = path.join(uploadsDir, uniqueFilename);
//   const tempPath = path.join(uploadsDir, `${timestamp}-${filename}.tmp`);

//   const out = createWriteStream(tempPath);
//   stream.pipe(out);
//   await finished(out);

//   await sharp(tempPath).webp({ quality: 80 }).toFile(uploadPath);

//   // Увеличиваем задержку перед удалением
//   await new Promise((resolve) => setTimeout(resolve, 500));
//   await fsPromises.unlink(tempPath);

//   return `/uploads/${uniqueFilename}`;
// };

// Вспомогательная функция для преобразования потока в буфер
const streamToBuffer = (stream) =>
  new Promise((resolve, reject) => {
    const chunks = []
    stream.on("data", (chunk) => chunks.push(chunk))
    stream.on("error", (err) => reject(err))
    stream.on("end", () => resolve(Buffer.concat(chunks)))
  })

export const uploadImage = async (image) => {
  const { createReadStream, filename } = await image
  const stream = createReadStream()
  const uploadsDir = path.join(process.cwd(), "uploads")

  if (!existsSync(uploadsDir)) {
    mkdirSync(uploadsDir)
  }

  const timestamp = Date.now()
  const uniqueFilename = `${timestamp}-${path.parse(filename).name}.webp`
  const uploadPath = path.join(uploadsDir, uniqueFilename)

  // Считываем весь поток в буфер
  const buffer = await streamToBuffer(stream)

  // Обработка изображения через sharp напрямую из буфера
  await sharp(buffer).webp({ quality: 80 }).toFile(uploadPath)

  return `/uploads/${uniqueFilename}`
}

export const deleteImage = async (imagePath) => {
  // Преобразуем относительный путь в абсолютный
  const absolutePath = path.join(process.cwd(), imagePath)
  try {
    await fsPromises.unlink(absolutePath)
    console.log(`Файл ${absolutePath} успешно удалён.`)
  } catch (error) {
    console.error(`Ошибка при удалении файла ${absolutePath}:`, error)
    // При необходимости можно пробросить ошибку или проигнорировать её
  }
}
