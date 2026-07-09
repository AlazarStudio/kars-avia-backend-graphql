import test from "node:test"
import assert from "node:assert/strict"
import { Readable } from "node:stream"
import sharp from "sharp"
import { prepareImage } from "../../services/docRecognition/imagePrep.js"

const makeUpload = (buffer, mimetype = "image/png") =>
  Promise.resolve({
    createReadStream: () => Readable.from(buffer),
    filename: "doc.png",
    mimetype
  })

test("prepareImage сжимает в jpeg и отдаёт base64", async () => {
  const png = await sharp({
    create: { width: 8, height: 8, channels: 3, background: { r: 10, g: 20, b: 30 } }
  }).png().toBuffer()

  const { base64, mimeType } = await prepareImage(makeUpload(png))
  assert.equal(mimeType, "image/jpeg")
  assert.ok(typeof base64 === "string" && base64.length > 0)
  const head = Buffer.from(base64, "base64").subarray(0, 2)
  assert.equal(head[0], 0xff)
  assert.equal(head[1], 0xd8)
})
