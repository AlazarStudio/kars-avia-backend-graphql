import sharp from "sharp"
import { streamToBuffer } from "../files/streamToBuffer.js"

export async function prepareImage(upload) {
  const { createReadStream } = await upload
  const buffer = await streamToBuffer(createReadStream())
  const jpeg = await sharp(buffer)
    .rotate()
    .resize({ width: 1600, height: 1600, fit: "inside", withoutEnlargement: true })
    .jpeg({ quality: 80 })
    .toBuffer()
  return { base64: jpeg.toString("base64"), mimeType: "image/jpeg" }
}
