import test from "node:test"
import assert from "node:assert/strict"
import { Readable } from "node:stream"
import { streamToBuffer } from "../../services/files/streamToBuffer.js"

test("streamToBuffer собирает чанки в один Buffer", async () => {
  const buf = await streamToBuffer(Readable.from([Buffer.from("hel"), Buffer.from("lo")]))
  assert.ok(Buffer.isBuffer(buf))
  assert.equal(buf.toString(), "hello")
})

test("streamToBuffer отклоняется при ошибке потока", async () => {
  const bad = new Readable({ read() { this.destroy(new Error("boom")) } })
  await assert.rejects(() => streamToBuffer(bad), /boom/)
})
