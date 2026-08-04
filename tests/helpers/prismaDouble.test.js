import test from "node:test"
import assert from "node:assert/strict"
import { prisma } from "../../prisma.js"
import { installPrismaDouble } from "./prismaDouble.js"

test("подменяет модели и возвращает документ из фикстуры", async () => {
  const double = installPrismaDouble({
    documents: { passengerRequest: { id: "r1", flightNumber: "SU100" } }
  })
  try {
    const found = await prisma.passengerRequest.findUnique({ where: { id: "r1" } })
    assert.equal(found.flightNumber, "SU100")
  } finally {
    double.restore()
  }
})

test("update записывает data и возвращает слитый документ", async () => {
  const double = installPrismaDouble({
    documents: { passengerRequest: { id: "r1", status: "CREATED", flightNumber: "SU100" } }
  })
  try {
    const updated = await prisma.passengerRequest.update({
      where: { id: "r1" },
      data: { status: "DONE" }
    })
    assert.equal(updated.status, "DONE")
    assert.equal(updated.flightNumber, "SU100")

    const calls = double.callsTo("passengerRequest", "update")
    assert.equal(calls.length, 1)
    assert.deepEqual(calls[0].args.data, { status: "DONE" })
  } finally {
    double.restore()
  }
})

test("последующее чтение видит результат записи", async () => {
  const double = installPrismaDouble({
    documents: { passengerRequest: { id: "r1", status: "CREATED" } }
  })
  try {
    await prisma.passengerRequest.update({ where: { id: "r1" }, data: { status: "DONE" } })
    const again = await prisma.passengerRequest.findUnique({ where: { id: "r1" } })
    assert.equal(again.status, "DONE")
  } finally {
    double.restore()
  }
})

test("незаданные модели возвращают безопасные пустышки", async () => {
  const double = installPrismaDouble({})
  try {
    assert.equal(await prisma.airline.findUnique({ where: { id: "a" } }), null)
    assert.deepEqual(await prisma.user.findMany({}), [])
    assert.equal((await prisma.log.create({ data: { action: "x" } })) !== null, true)
  } finally {
    double.restore()
  }
})

test("$transaction выполняет массив операций и записывается в лог вызовов", async () => {
  const double = installPrismaDouble({
    documents: { passengerRequest: { id: "r1" } }
  })
  try {
    const result = await prisma.$transaction([
      prisma.passengerRequestHotelReport.deleteMany({ where: { hotelIndex: 0 } }),
      prisma.passengerRequest.update({ where: { id: "r1" }, data: { status: "X" } })
    ])
    assert.equal(result.length, 2)
    assert.equal(double.callsTo("$transaction").length, 1)
  } finally {
    double.restore()
  }
})

test("restore возвращает исходные модели", () => {
  const before = prisma.passengerRequest
  const double = installPrismaDouble({})
  assert.notEqual(prisma.passengerRequest, before)
  double.restore()
  assert.equal(prisma.passengerRequest, before)
})

test("вызовы фиксируются в порядке выполнения и несут возрастающий seq", async () => {
  const double = installPrismaDouble({
    documents: { passengerRequest: { id: "r1" } }
  })
  try {
    await prisma.passengerRequest.findUnique({ where: { id: "r1" } })
    await prisma.passengerRequest.update({ where: { id: "r1" }, data: {} })
    await prisma.log.create({ data: { action: "a" } })
    assert.deepEqual(
      double.calls.map((c) => `${c.model}.${c.method}`),
      ["passengerRequest.findUnique", "passengerRequest.update", "log.create"]
    )
    const seqs = double.calls.map((c) => c.seq)
    assert.deepEqual(seqs, [...seqs].sort((a, b) => a - b))
    assert.ok(seqs.every((s) => typeof s === "number"))
  } finally {
    double.restore()
  }
})

test("аргументы в журнале — снимок, а не ссылка на живой объект", async () => {
  const double = installPrismaDouble({
    documents: { passengerRequest: { id: "r1" } }
  })
  try {
    const data = { status: "CREATED" }
    await prisma.passengerRequest.update({ where: { id: "r1" }, data })
    data.status = "ИЗМЕНЕНО ПОСЛЕ ВЫЗОВА"
    assert.equal(double.callsTo("passengerRequest", "update")[0].args.data.status, "CREATED")
  } finally {
    double.restore()
  }
})
