import test from "node:test"
import assert from "node:assert/strict"
import path from "path"
import { resolveAbsoluteFilePath } from "../../services/files/uploadFiles.js"
import {
  canonicalFilePath,
  filePathsMatch,
  findPassengerRequestFileIndex
} from "../../services/passengerRequest/files.js"

test("resolveAbsoluteFilePath: strips /files/ prefix", () => {
  const absolute = resolveAbsoluteFilePath(
    "/files/uploads/passenger-requests/abc/2026/06/03/doc.pdf"
  )
  assert.equal(
    absolute,
    path.join(
      process.cwd(),
      "uploads/passenger-requests/abc/2026/06/03/doc.pdf"
    )
  )
})

test("resolveAbsoluteFilePath: accepts uploads path without /files/", () => {
  const absolute = resolveAbsoluteFilePath(
    "uploads/passenger-requests/abc/file.png"
  )
  assert.equal(
    absolute,
    path.join(process.cwd(), "uploads/passenger-requests/abc/file.png")
  )
})

test("canonicalFilePath and filePathsMatch", () => {
  const stored = "/files/uploads/passenger-requests/id/2026/01/01-a.pdf"
  const client = "uploads/passenger-requests/id/2026/01/01-a.pdf"

  assert.equal(canonicalFilePath(stored), stored)
  assert.equal(canonicalFilePath(client), stored)
  assert.ok(filePathsMatch(stored, client))
})

test("findPassengerRequestFileIndex matches by canonical path", () => {
  const files = [
    "/files/uploads/passenger-requests/r1/2026/06/03/1-doc.pdf"
  ]
  const index = findPassengerRequestFileIndex(
    files,
    "uploads/passenger-requests/r1/2026/06/03/1-doc.pdf"
  )
  assert.equal(index, 0)
})

test("findPassengerRequestFileIndex returns -1 when missing", () => {
  assert.equal(
    findPassengerRequestFileIndex(["/files/uploads/a.pdf"], "/files/uploads/b.pdf"),
    -1
  )
})
