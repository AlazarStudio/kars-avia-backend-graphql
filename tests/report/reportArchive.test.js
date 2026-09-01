import test from "node:test"
import assert from "node:assert/strict"
import {
  appendSavedReportArchiveFilter,
  isArchivedReportFilter,
  isSavedReportArchived
} from "../../services/report/reportArchive.js"
import { applyFilters } from "../../services/report/reportUtils.js"

test("archived filter is true only for archived: true", () => {
  assert.equal(isArchivedReportFilter({ archived: true }), true)
  assert.equal(isArchivedReportFilter({ archived: false }), false)
  assert.equal(isArchivedReportFilter({}), false)
  assert.equal(isArchivedReportFilter(null), false)
})

test("активный список: не вручную в архиве и endDate не старше предыдущей декады", () => {
  const AND = []
  appendSavedReportArchiveFilter({}, AND, new Date(2026, 7, 27))
  assert.deepEqual(AND[0], { isArchived: { not: true } })
  assert.equal(AND[1].endDate.gte.getDate(), 11)
  assert.equal(AND[1].endDate.gte.getMonth(), 7)
})

test("архив: вручную или endDate старше предыдущей декады", () => {
  const AND = []
  appendSavedReportArchiveFilter({ archived: true }, AND, new Date(2026, 7, 27))
  assert.equal(AND.length, 1)
  assert.equal(AND[0].OR[0].isArchived, true)
  assert.equal(AND[0].OR[1].endDate.lt.getDate(), 11)
})

test("ручной архив текущей декады считается archived", () => {
  const now = new Date(2026, 7, 27)
  assert.equal(
    isSavedReportArchived(
      { isArchived: true, endDate: new Date(2026, 7, 31) },
      now
    ),
    true
  )
  assert.equal(
    isSavedReportArchived(
      { isArchived: false, endDate: new Date(2026, 7, 31) },
      now
    ),
    false
  )
  assert.equal(
    isSavedReportArchived(
      { isArchived: false, endDate: new Date(2026, 7, 5) },
      now
    ),
    true
  )
})

test("applyFilters больше не пишет поле archived в Prisma where", () => {
  const where = applyFilters({
    archived: true,
    airlineId: "air-1"
  })
  assert.equal(where.archived, undefined)
  assert.equal(where.airlineId, "air-1")
})
