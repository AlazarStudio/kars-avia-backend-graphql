import test from "node:test"
import assert from "node:assert/strict"
import {
  audiencesInputToRecordData,
  buildAudienceBlocks,
  compareVersions,
  computeShouldShow,
  hasSectionContent,
  messageToLegacySection,
  resolveSystemUpdateAudience,
  toSystemUpdateResponse,
  validateSystemUpdateInput
} from "../../services/site/systemUpdateUtils.js"

const sampleRecord = {
  version: "3.6.0",
  title: "Что нового",
  enabled: true,
  publishedAt: new Date("2026-06-30"),
  airline: {
    new: [{ title: "Новая фича АК", description: "Описание" }],
    updates: [],
    fixes: []
  },
  dispatcher: {
    new: [],
    updates: [{ title: "Обновление диспетчеров", description: null }],
    fixes: []
  },
  hotel: {
    new: [],
    updates: [],
    fixes: [{ title: "Фикс отелей", description: null }]
  }
}

const fullAudiencesInput = [
  {
    audience: "AIRLINE",
    sections: {
      new: [{ title: "Новая фича АК", description: "Описание" }],
      updates: [],
      fixes: []
    }
  },
  {
    audience: "DISPATCHER",
    sections: {
      new: [],
      updates: [{ title: "Обновление диспетчеров" }],
      fixes: []
    }
  },
  {
    audience: "HOTEL",
    sections: {
      new: [],
      updates: [],
      fixes: [{ title: "Фикс отелей" }]
    }
  }
]

test("compareVersions orders semver parts", () => {
  assert.equal(compareVersions("3.5.0", "3.4.0"), 1)
  assert.equal(compareVersions("3.4.0", "3.5.0"), -1)
  assert.equal(compareVersions("3.5.0", "3.5.0"), 0)
})

test("compareVersions rejects invalid format", () => {
  assert.throws(() => compareVersions("3.5", "3.4.0"), /X\.Y\.Z/)
})

test("resolveSystemUpdateAudience maps roles", () => {
  assert.equal(
    resolveSystemUpdateAudience({
      subjectType: "USER",
      subject: { role: "AIRLINEADMIN" }
    }),
    "AIRLINE"
  )
  assert.equal(
    resolveSystemUpdateAudience({
      subjectType: "USER",
      subject: { role: "HOTELUSER" }
    }),
    "HOTEL"
  )
  assert.equal(
    resolveSystemUpdateAudience({
      subjectType: "USER",
      subject: { role: "DISPATCHERUSER" }
    }),
    "DISPATCHER"
  )
  assert.equal(
    resolveSystemUpdateAudience({
      subjectType: "USER",
      subject: { role: "SUPERADMIN" }
    }),
    "ALL"
  )
  assert.equal(
    resolveSystemUpdateAudience({
      subjectType: "USER",
      subject: { role: "USER" }
    }),
    null
  )
})

test("hasSectionContent detects non-empty sections", () => {
  assert.equal(hasSectionContent(sampleRecord.airline), true)
  assert.equal(
    hasSectionContent({ new: [], updates: [], fixes: [] }),
    false
  )
})

test("computeShouldShow respects audience content", () => {
  const emptyAirlineRecord = {
    ...sampleRecord,
    airline: { new: [], updates: [], fixes: [] }
  }

  assert.equal(
    computeShouldShow(
      { enabled: true, version: "3.6.0" },
      null,
      "AIRLINE",
      emptyAirlineRecord
    ),
    false
  )

  assert.equal(
    computeShouldShow(
      { enabled: true, version: "3.6.0" },
      "3.6.0",
      "AIRLINE",
      sampleRecord
    ),
    false
  )

  assert.equal(
    computeShouldShow(
      { enabled: true, version: "3.6.0" },
      null,
      "AIRLINE",
      sampleRecord
    ),
    true
  )
})

test("toSystemUpdateResponse returns one audience for hotel user", () => {
  const context = {
    subjectType: "USER",
    subject: { role: "HOTELUSER" }
  }
  const result = toSystemUpdateResponse(sampleRecord, null, context)

  assert.equal(result.audiences.length, 1)
  assert.equal(result.audiences[0].audience, "HOTEL")
  assert.equal(result.audiences[0].sections.fixes[0].title, "Фикс отелей")
  assert.equal(result.shouldShow, true)
})

test("toSystemUpdateResponse returns all audiences for superadmin", () => {
  const context = {
    subjectType: "USER",
    subject: { role: "SUPERADMIN" }
  }
  const result = toSystemUpdateResponse(sampleRecord, null, context)

  assert.equal(result.audiences.length, 3)
  assert.deepEqual(
    result.audiences.map((item) => item.audience),
    ["AIRLINE", "DISPATCHER", "HOTEL"]
  )
})

test("toSystemUpdateResponse returns defaults when record is null", () => {
  const result = toSystemUpdateResponse(null, null, {
    subjectType: "USER",
    subject: { role: "HOTELUSER" }
  })

  assert.deepEqual(result, {
    version: null,
    title: null,
    enabled: false,
    publishedAt: null,
    audiences: [
      {
        audience: "HOTEL",
        sections: { new: [], updates: [], fixes: [] }
      }
    ],
    shouldShow: false
  })
})

test("validateSystemUpdateInput requires fields when enabled", () => {
  assert.throws(
    () =>
      validateSystemUpdateInput({
        enabled: true,
        version: "bad",
        title: "Title",
        audiences: fullAudiencesInput
      }),
    /Версия/
  )

  assert.throws(
    () =>
      validateSystemUpdateInput({
        enabled: true,
        version: "3.6.0",
        title: "  ",
        audiences: fullAudiencesInput
      }),
    /Заголовок/
  )

  assert.throws(
    () =>
      validateSystemUpdateInput({
        enabled: true,
        version: "3.6.0",
        title: "Title",
        audiences: fullAudiencesInput.slice(0, 1)
      }),
    /3 аудитории/
  )

  assert.throws(
    () =>
      validateSystemUpdateInput({
        enabled: true,
        version: "3.6.0",
        title: "Title",
        audiences: [
          {
            audience: "AIRLINE",
            sections: {
              new: [{ title: "A" }],
              updates: [],
              fixes: []
            }
          },
          {
            audience: "DISPATCHER",
            sections: {
              new: [{ title: "B" }],
              updates: [],
              fixes: []
            }
          },
          {
            audience: "AIRLINE",
            sections: {
              new: [{ title: "C" }],
              updates: [],
              fixes: []
            }
          }
        ]
      }),
    /повторяться/
  )
})

test("validateSystemUpdateInput requires at least one item", () => {
  assert.throws(
    () =>
      validateSystemUpdateInput({
        enabled: true,
        version: "3.6.0",
        title: "Title",
        audiences: [
          {
            audience: "AIRLINE",
            sections: { new: [], updates: [], fixes: [] }
          },
          {
            audience: "DISPATCHER",
            sections: { new: [], updates: [], fixes: [] }
          },
          {
            audience: "HOTEL",
            sections: { new: [], updates: [], fixes: [] }
          }
        ]
      }),
    /хотя бы один пункт/
  )
})

test("validateSystemUpdateInput allows empty fields when disabled", () => {
  assert.doesNotThrow(() =>
    validateSystemUpdateInput({
      enabled: false,
      version: "",
      title: "",
      audiences: []
    })
  )
})

test("audiencesInputToRecordData maps all audiences", () => {
  const data = audiencesInputToRecordData(fullAudiencesInput)

  assert.equal(data.airline.new[0].title, "Новая фича АК")
  assert.equal(data.dispatcher.updates[0].title, "Обновление диспетчеров")
  assert.equal(data.hotel.fixes[0].title, "Фикс отелей")
})

test("messageToLegacySection converts bullet list", () => {
  const section = messageToLegacySection("• Первая строка\n- Вторая строка")

  assert.equal(section.new.length, 0)
  assert.equal(section.updates.length, 2)
  assert.equal(section.updates[0].title, "Первая строка")
  assert.equal(section.updates[1].title, "Вторая строка")
})

test("buildAudienceBlocks returns all for superadmin key", () => {
  const blocks = buildAudienceBlocks(sampleRecord, "ALL")
  assert.equal(blocks.length, 3)
})
