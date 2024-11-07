import { finished } from "stream/promises"
import { createWriteStream, existsSync, mkdirSync } from "fs"
import path from "path"

const uploadImage = async (image) => {
  const { createReadStream, filename } = await image
  const stream = createReadStream()
  const uploadsDir = path.join(process.cwd(), "uploads")

  if (!existsSync(uploadsDir)) {
    mkdirSync(uploadsDir)
  }

  const uniqueFilename = `${Date.now()}-${filename}`
  const uploadPath = path.join(uploadsDir, uniqueFilename)
  const out = createWriteStream(uploadPath)
  stream.pipe(out)
  await finished(out)

  return `/uploads/${uniqueFilename}`
}

export default uploadImage
