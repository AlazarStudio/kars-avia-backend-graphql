// Ссылки входа гостиницы выпускаются для заявки ФАП и в карточку гостиницы
// не копируются: оттуда их читал любой вошедший (ПДН-Е-07).

import test from "node:test"
import assert from "node:assert/strict"
import { generateHotelLinks } from "../../services/passengerRequest/externalLinks.js"
import { installPrismaDouble } from "../helpers/prismaDouble.js"

test("generateHotelLinks выдаёт ссылки, но не пишет их в Hotel", async () => {
  const db = installPrismaDouble({ documents: { hotel: { id: "h1", name: "Отель" } } })
  try {
    const links = await generateHotelLinks({
      hotel: { hotelId: "h1", name: "Отель" },
      requestId: "r1",
      adminId: "u1"
    })
    assert.match(links.linkCRM, /external-login\?/)
    assert.match(links.linkPWA, /external-login\?/)
    assert.equal(db.callsTo("hotel", "update").length, 0)
  } finally {
    db.restore()
  }
})
