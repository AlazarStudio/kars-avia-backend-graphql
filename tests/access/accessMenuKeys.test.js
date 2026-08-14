import test from "node:test"
import assert from "node:assert/strict"
import fs from "node:fs"
import path from "node:path"
import { fileURLToPath } from "node:url"
import { ACCESS_MENU_KEYS } from "../../services/access/accessMenuKeys.js"

const here = path.dirname(fileURLToPath(import.meta.url))

// Список ключей и composite-тип в схеме должны совпадать: ключ, забытый в
// списке, не переносится между слоями (должность не перекроет отдел), а ключ,
// забытый в схеме, молча не сохранится.
test("ACCESS_MENU_KEYS совпадает с полями type AccessMenu в schema.prisma", () => {
  const schema = fs.readFileSync(
    path.join(here, "..", "..", "prisma", "schema.prisma"),
    "utf8"
  )
  const block = schema.match(/type AccessMenu \{([\s\S]*?)\n\}/)
  assert.ok(block, "в схеме не найден type AccessMenu")

  const fields = block[1]
    .split("\n")
    .map((line) => line.trim())
    .filter((line) => line && !line.startsWith("//"))
    .map((line) => line.split(/\s+/)[0])

  // предпосылка: разбор действительно что-то нашёл, иначе тест зелёный на чём угодно
  assert.ok(fields.length > 10, `разбор схемы дал ${fields.length} полей`)
  assert.deepEqual([...ACCESS_MENU_KEYS].sort(), [...fields].sort())
})

test("новое право на правку завершённой заявки объявлено", () => {
  assert.ok(ACCESS_MENU_KEYS.includes("reserveUpdateCompleted"))
})

test("права accessManage и travellineMenu объявлены", () => {
  assert.ok(ACCESS_MENU_KEYS.includes("accessManage"))
  assert.ok(ACCESS_MENU_KEYS.includes("travellineMenu"))
})
