import test from "node:test"
import assert from "node:assert/strict"
import {
  buildHotelPreviewUrl,
  clampPreviewHours,
  collectHotelPreviewFilePaths,
  isHotelPreviewFilePathAllowed
} from "../../services/hotel/hotelPreviewLink.js"

test("hotel preview: clampPreviewHours limits range to 1..72", () => {
  assert.equal(clampPreviewHours(0), 1)
  assert.equal(clampPreviewHours(-5), 1)
  assert.equal(clampPreviewHours(24), 24)
  assert.equal(clampPreviewHours(200), 72)
  assert.equal(clampPreviewHours("abc"), 1)
  assert.equal(clampPreviewHours(12.9), 12)
})

test("hotel preview: buildHotelPreviewUrl includes token query param", () => {
  const link = buildHotelPreviewUrl("preview-token-123")
  assert.match(link, /\/hotel-preview\?token=preview-token-123$/)
})

test("hotel preview: collectHotelPreviewFilePaths gathers nested image paths", () => {
  const paths = collectHotelPreviewFilePaths({
    images: ["/uploads/hotel/main.jpg"],
    gallery: ["/uploads/hotel/gallery-1.jpg"],
    rooms: [{ images: ["/uploads/hotel/room-1.jpg"] }],
    roomKind: [{ images: ["/uploads/hotel/kind-1.jpg"] }],
    additionalServices: [{ images: ["/uploads/hotel/service-1.jpg"] }]
  })

  assert.equal(paths.size, 5)
  assert.equal(paths.has("/uploads/hotel/main.jpg"), true)
  assert.equal(paths.has("/uploads/hotel/service-1.jpg"), true)
})

test("hotel preview: isHotelPreviewFilePathAllowed matches hotel files only", () => {
  const hotel = {
    images: ["/uploads/hotel/main.jpg"],
    gallery: [],
    rooms: [],
    roomKind: [],
    additionalServices: []
  }

  assert.equal(
    isHotelPreviewFilePathAllowed(hotel, "uploads/hotel/main.jpg"),
    true
  )
  assert.equal(
    isHotelPreviewFilePathAllowed(hotel, "files/uploads/hotel/main.jpg"),
    true
  )
  assert.equal(
    isHotelPreviewFilePathAllowed(hotel, "uploads/other-hotel/main.jpg"),
    false
  )
})
