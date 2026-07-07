import test from "node:test"
import assert from "node:assert/strict"
import { GraphQLError } from "graphql"
import {
  deriveDisplayNameFromPath,
  findContractFileIndex,
  normalizeContractFiles,
  replaceUrlInContractFiles,
  validateContractFileUploadInput
} from "../../services/contract/files.js"

test("deriveDisplayNameFromPath strips timestamp prefix", () => {
  assert.equal(
    deriveDisplayNameFromPath(
      "/files/uploads/misc/2026/07/07/1234567890-dogovor.pdf"
    ),
    "dogovor.pdf"
  )
})

test("normalizeContractFiles converts legacy string array", () => {
  const files = normalizeContractFiles([
    "/files/uploads/misc/2026/07/07/1-doc.pdf"
  ])

  assert.equal(files.length, 1)
  assert.equal(files[0].name, "doc.pdf")
  assert.equal(files[0].url, "/files/uploads/misc/2026/07/07/1-doc.pdf")
})

test("normalizeContractFiles keeps ContractFile objects", () => {
  const files = normalizeContractFiles([
    { name: "Договор", url: "/files/uploads/misc/a.pdf" }
  ])

  assert.deepEqual(files, [
    { name: "Договор", url: "/files/uploads/misc/a.pdf" }
  ])
})

test("findContractFileIndex matches by canonical path", () => {
  const files = [
    {
      name: "Договор",
      url: "/files/uploads/misc/2026/07/07/1-doc.pdf"
    }
  ]

  const index = findContractFileIndex(
    files,
    "uploads/misc/2026/07/07/1-doc.pdf"
  )
  assert.equal(index, 0)
})

test("findContractFileIndex returns -1 when missing", () => {
  assert.equal(
    findContractFileIndex(
      [{ name: "A", url: "/files/uploads/a.pdf" }],
      "/files/uploads/b.pdf"
    ),
    -1
  )
})

test("replaceUrlInContractFiles updates matched url only", () => {
  const files = [
    { name: "A", url: "/uploads/misc/old.pdf" },
    { name: "B", url: "/uploads/misc/other.pdf" }
  ]

  const updated = replaceUrlInContractFiles(files, ["/uploads/misc/old.pdf"], "/uploads/misc/new.pdf")

  assert.equal(updated[0].url, "/uploads/misc/new.pdf")
  assert.equal(updated[0].name, "A")
  assert.equal(updated[1].url, "/uploads/misc/other.pdf")
})

test("validateContractFileUploadInput requires matching lengths", () => {
  assert.throws(
    () => validateContractFileUploadInput([{}], []),
    (error) =>
      error instanceof GraphQLError &&
      error.message === "fileNames is required when files are provided"
  )

  assert.throws(
    () => validateContractFileUploadInput([{}, {}], ["one"]),
    (error) =>
      error instanceof GraphQLError &&
      error.message === "files and fileNames must have the same length"
  )

  assert.throws(
    () => validateContractFileUploadInput([{}], ["   "]),
    (error) =>
      error instanceof GraphQLError &&
      error.message === "Each file name must be a non-empty string"
  )

  assert.doesNotThrow(() =>
    validateContractFileUploadInput([{}], ["Договор основной"])
  )
})
