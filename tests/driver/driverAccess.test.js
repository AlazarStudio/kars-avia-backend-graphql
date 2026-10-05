// Доступ к водителям (аудит 152-ФЗ): чтения требуют входа, правка — своего
// водителя или диспетчерской роли, анонимная саморегистрация не задаёт
// служебные поля.

import test from "node:test"
import assert from "node:assert/strict"
import driverResolver from "../../resolvers/driver/driver.resolver.js"
import organizationResolver from "../../resolvers/organization/organization.resolver.js"
import globalResolver from "../../resolvers/global/global.resolver.js"
import {
  DRIVER_DIRECTORY_ROLES,
  DRIVER_SERVICE_FIELDS,
  assertCanEditDriver,
  canReadDriver,
  isDriverDirectoryReader,
  isDriverManager,
  isDriverSelf,
  needsOrganizationReconfirm,
  organizationDriversWhere,
  sanitizeDriverInputForSubject
} from "../../services/driver/driverAccess.js"
import { installPrismaDouble } from "../helpers/prismaDouble.js"
import {
  installPubsubSpy,
  releasePubsubAfterTests
} from "../helpers/fapHarness.js"

releasePubsubAfterTests()

const driverContext = (id) => ({
  subjectType: "DRIVER",
  subject: { id, refreshToken: "s" },
  decoded: { role: "DRIVER" }
})

const userContext = (role) => ({
  subjectType: "USER",
  subject: { id: `user-${role}`, role, refreshToken: "s" },
  decoded: { role }
})

const rejectsWithCode = (promise, code) =>
  assert.rejects(promise, (error) => error.extensions?.code === code)

test("driver queries: anonymous call is rejected", async () => {
  const prismaDouble = installPrismaDouble()
  try {
    const { Query } = driverResolver
    await rejectsWithCode(
      Query.drivers(null, { pagination: { all: true } }, {}),
      "UNAUTHORIZED"
    )
    await rejectsWithCode(
      Query.driverById(null, { id: "d1" }, {}),
      "UNAUTHORIZED"
    )
    await rejectsWithCode(
      Query.driverByEmail(null, { email: "a@b.c" }, {}),
      "UNAUTHORIZED"
    )
    assert.equal(prismaDouble.callsTo("driver").length, 0)
  } finally {
    prismaDouble.restore()
  }
})

test("driver queries: driver with token keeps access", async () => {
  const prismaDouble = installPrismaDouble({
    documents: { driver: { id: "d1", name: "A" } }
  })
  try {
    const driver = await driverResolver.Query.driverById(
      null,
      { id: "d1" },
      driverContext("d1")
    )
    assert.equal(driver.id, "d1")
  } finally {
    prismaDouble.restore()
  }
})

test("isDriverSelf: only DRIVER subject with the same id", () => {
  assert.equal(isDriverSelf(driverContext("d1"), "d1"), true)
  assert.equal(isDriverSelf(driverContext("d1"), "d2"), false)
  assert.equal(isDriverSelf(userContext("SUPERADMIN"), "d1"), false)
  assert.equal(isDriverSelf({}, "d1"), false)
  assert.equal(
    isDriverSelf({ subjectType: "USER", subject: { id: "d1" } }, "d1"),
    false
  )
})

test("isDriverManager: dispatcher roles only", () => {
  assert.equal(isDriverManager(userContext("SUPERADMIN")), true)
  assert.equal(isDriverManager(userContext("DISPATCHERADMIN")), true)
  assert.equal(isDriverManager(userContext("DISPATCHERMODERATOR")), true)
  assert.equal(isDriverManager(userContext("AIRLINEADMIN")), false)
  assert.equal(isDriverManager(userContext("REPRESENTATIVE")), false)
  assert.equal(isDriverManager(driverContext("d1")), false)
  assert.equal(isDriverManager({}), false)
})

test("assertCanEditDriver: driver A cannot edit driver B", async () => {
  await rejectsWithCode(
    assertCanEditDriver(driverContext("A"), "B"),
    "FORBIDDEN"
  )
  await assertCanEditDriver(driverContext("A"), "A")
})

test("assertCanEditDriver: dispatcher edits any, others are refused", async () => {
  const prismaDouble = installPrismaDouble()
  try {
    await assertCanEditDriver(userContext("DISPATCHERADMIN"), "B")
    await assertCanEditDriver(userContext("DISPATCHERMODERATOR"), "B")
    await assertCanEditDriver(userContext("SUPERADMIN"), "B")
    await rejectsWithCode(
      assertCanEditDriver(userContext("AIRLINEADMIN"), "B"),
      "FORBIDDEN"
    )
    await rejectsWithCode(assertCanEditDriver({}, "B"), "UNAUTHORIZED")
  } finally {
    prismaDouble.restore()
  }
})

test("updateDriver: driver A is refused before any write to driver B", async () => {
  const prismaDouble = installPrismaDouble({
    documents: { driver: { id: "B", name: "B" } }
  })
  try {
    await rejectsWithCode(
      driverResolver.Mutation.updateDriver(
        null,
        { id: "B", input: { name: "hacked" } },
        driverContext("A")
      ),
      "FORBIDDEN"
    )
    await rejectsWithCode(
      driverResolver.Mutation.updateDriverDocuments(
        null,
        { id: "B" },
        driverContext("A")
      ),
      "FORBIDDEN"
    )
    assert.equal(prismaDouble.callsTo("driver").length, 0)
  } finally {
    prismaDouble.restore()
  }
})

test("updateDriver: self edit drops service fields, dispatcher keeps them", async () => {
  const pubsubSpy = installPubsubSpy()
  const input = {
    name: "New name",
    registrationStatus: "APPROVED",
    organizationConfirmed: true,
    rating: 5,
    active: true,
    refusalReason: "x"
  }

  const selfDouble = installPrismaDouble({
    documents: { driver: { id: "A", name: "A" } }
  })
  try {
    await driverResolver.Mutation.updateDriver(
      null,
      { id: "A", input },
      driverContext("A")
    )
    const [update] = selfDouble.callsTo("driver", "update")
    assert.equal(update.args.data.name, "New name")
    for (const field of DRIVER_SERVICE_FIELDS) {
      assert.equal(field in update.args.data, false, field)
    }
  } finally {
    selfDouble.restore()
  }

  const dispatcherDouble = installPrismaDouble({
    documents: { driver: { id: "A", name: "A" } }
  })
  try {
    await driverResolver.Mutation.updateDriver(
      null,
      { id: "A", input },
      userContext("DISPATCHERADMIN")
    )
    const [update] = dispatcherDouble.callsTo("driver", "update")
    assert.equal(update.args.data.registrationStatus, "APPROVED")
    assert.equal(update.args.data.organizationConfirmed, true)
  } finally {
    dispatcherDouble.restore()
    pubsubSpy.restore()
  }
})

test("sanitizeDriverInputForSubject: strips service fields for non-managers", () => {
  const input = {
    name: "A",
    registrationStatus: "APPROVED",
    transferPrices: [{ prices: {} }]
  }
  assert.deepEqual(sanitizeDriverInputForSubject(input, {}), { name: "A" })
  assert.deepEqual(
    sanitizeDriverInputForSubject(input, driverContext("d1")),
    { name: "A" }
  )
  assert.equal(
    sanitizeDriverInputForSubject(input, userContext("DISPATCHERADMIN")),
    input
  )
  assert.equal(sanitizeDriverInputForSubject(undefined, {}), undefined)
})

test("createDriver: anonymous registration ignores service fields", async () => {
  const pubsubSpy = installPubsubSpy()
  const prismaDouble = installPrismaDouble()
  try {
    await driverResolver.Mutation.createDriver(
      null,
      {
        input: {
          name: "A",
          number: "+70000000000",
          email: "a@example.test",
          password: "secret",
          registrationStatus: "APPROVED",
          transferPrices: [{ prices: {}, airportIds: [], cityIds: [] }]
        }
      },
      {}
    )
    const [create] = prismaDouble.callsTo("driver", "create")
    assert.equal(create.args.data.registrationStatus, "PENDING")
    assert.equal(prismaDouble.callsTo("transferPrice", "create").length, 0)
  } finally {
    prismaDouble.restore()
    pubsubSpy.restore()
  }
})

test("createDriver: dispatcher may set registration status", async () => {
  const pubsubSpy = installPubsubSpy()
  const prismaDouble = installPrismaDouble()
  try {
    await driverResolver.Mutation.createDriver(
      null,
      {
        input: {
          name: "A",
          number: "+70000000001",
          email: "b@example.test",
          password: "secret",
          registrationStatus: "APPROVED"
        }
      },
      userContext("DISPATCHERADMIN")
    )
    const [create] = prismaDouble.callsTo("driver", "create")
    assert.equal(create.args.data.registrationStatus, "APPROVED")
  } finally {
    prismaDouble.restore()
    pubsubSpy.restore()
  }
})

// --- Круг правок после ревью: чтения сужены, поля водителя без корневого
// гарда закрыты, смена организации водителем снимает подтверждение.

const withDouble = async (options, run) => {
  const pubsubSpy = installPubsubSpy()
  const prismaDouble = installPrismaDouble(options)
  try {
    return await run(prismaDouble)
  } finally {
    prismaDouble.restore()
    pubsubSpy.restore()
  }
}

test("drivers: driver gets only own card, directory roles get the list", async () => {
  await withDouble({}, async (prismaDouble) => {
    await driverResolver.Query.drivers(
      null,
      { pagination: { all: true } },
      driverContext("A")
    )
    const [findMany] = prismaDouble.callsTo("driver", "findMany")
    assert.deepEqual(findMany.args.where, { active: true, id: "A" })
    const [count] = prismaDouble.callsTo("driver", "count")
    assert.deepEqual(count.args.where, { active: true, id: "A" })
  })

  await withDouble({}, async (prismaDouble) => {
    await driverResolver.Query.drivers(
      null,
      { pagination: { all: true } },
      userContext("AIRLINEADMIN")
    )
    const [findMany] = prismaDouble.callsTo("driver", "findMany")
    assert.deepEqual(findMany.args.where, { active: true })
  })
})

test("driver reads: self-registered USER and AIRLINE_PERSONAL are refused", async () => {
  await withDouble({ documents: { driver: { id: "B" } } }, async () => {
    const personal = {
      subjectType: "AIRLINE_PERSONAL",
      subject: { id: "p1", role: "AIRLINE_PERSONAL" },
      decoded: { role: "AIRLINE_PERSONAL" }
    }
    for (const context of [userContext("USER"), personal]) {
      await rejectsWithCode(
        driverResolver.Query.drivers(null, { pagination: {} }, context),
        "FORBIDDEN"
      )
      await rejectsWithCode(
        driverResolver.Query.driverById(null, { id: "B" }, context),
        "FORBIDDEN"
      )
    }
  })
})

test("driver directory: hotel roles are refused, Organization.drivers is empty", async () => {
  const hotelRoles = ["HOTELADMIN", "HOTELMODERATOR", "HOTELUSER"]
  for (const role of hotelRoles) {
    assert.equal(DRIVER_DIRECTORY_ROLES.includes(role), false, role)
  }

  await withDouble(
    { documents: { driver: { id: "B" }, driverMany: [{ id: "B" }] } },
    async (prismaDouble) => {
      for (const role of hotelRoles) {
        const context = userContext(role)
        assert.equal(isDriverDirectoryReader(context), false, role)
        assert.equal(canReadDriver(context, "B"), false, role)
        await rejectsWithCode(
          driverResolver.Query.drivers(null, { pagination: {} }, context),
          "FORBIDDEN"
        )
        await rejectsWithCode(
          driverResolver.Query.driverById(null, { id: "B" }, context),
          "FORBIDDEN"
        )
        assert.equal(organizationDriversWhere(context, "org1"), null)
        assert.deepEqual(
          await organizationResolver.Organization.drivers(
            { id: "org1" },
            {},
            context
          ),
          []
        )
      }
      assert.equal(prismaDouble.callsTo("driver").length, 0)
    }
  )
})

test("driverById / driverByEmail: driver A cannot read driver B", async () => {
  await withDouble({ documents: { driver: { id: "B" } } }, async () => {
    await rejectsWithCode(
      driverResolver.Query.driverById(null, { id: "B" }, driverContext("A")),
      "FORBIDDEN"
    )
    const byEmail = await driverResolver.Query.driverByEmail(
      null,
      { email: "b@example.test" },
      driverContext("A")
    )
    assert.equal(byEmail, null)
    const forDispatcher = await driverResolver.Query.driverById(
      null,
      { id: "B" },
      userContext("DISPATCHERMODERATOR")
    )
    assert.equal(forDispatcher.id, "B")
  })
})

test("Organization.drivers: anonymous gets nothing, driver only self", async () => {
  await withDouble({ documents: { driverMany: [{ id: "B" }] } }, async (prismaDouble) => {
    const { drivers } = organizationResolver.Organization
    assert.deepEqual(await drivers({ id: "org1" }, {}, {}), [])
    assert.deepEqual(await drivers({ id: "org1" }, {}, undefined), [])
    assert.equal(prismaDouble.callsTo("driver").length, 0)

    const forDriver = await drivers({ id: "org1" }, {}, driverContext("A"))
    assert.equal(forDriver.length, 1)
    const [findMany] = prismaDouble.callsTo("driver", "findMany")
    assert.deepEqual(findMany.args.where, { organizationId: "org1", id: "A" })
  })

  assert.equal(organizationDriversWhere({}, "org1"), null)
  assert.equal(organizationDriversWhere(userContext("USER"), "org1"), null)
  assert.deepEqual(
    organizationDriversWhere(userContext("REPRESENTATIVE"), "org1"),
    { organizationId: "org1" }
  )
})

test("Driver.transfers / transferMessages and TransferPrice.driver hide other drivers", async () => {
  await withDouble({}, async (prismaDouble) => {
    const { transfers, transferMessages } = driverResolver.Driver
    const parent = { id: "B" }
    assert.deepEqual(await transfers(parent, {}, {}), [])
    assert.deepEqual(await transferMessages(parent, {}, {}), [])
    assert.deepEqual(await transfers(parent, {}, driverContext("A")), [])
    assert.deepEqual(
      await transferMessages(parent, {}, userContext("AIRLINEADMIN")),
      []
    )
    assert.equal(
      await globalResolver.TransferPrice.driver({ driverId: "B" }, {}, {}),
      null
    )
    assert.equal(prismaDouble.callsTo("transfer").length, 0)
    assert.equal(prismaDouble.callsTo("transferMessage").length, 0)
    assert.equal(prismaDouble.callsTo("driver").length, 0)

    await transfers(parent, {}, userContext("AIRLINEADMIN"))
    await transferMessages(parent, {}, driverContext("B"))
    assert.equal(prismaDouble.callsTo("transfer", "findMany").length, 1)
    assert.equal(prismaDouble.callsTo("transferMessage", "findMany").length, 1)
  })
})

const registration = (overrides = {}) => ({
  input: {
    name: "A",
    number: "+70000000002",
    email: "c@example.test",
    password: "secret",
    ...overrides
  }
})

test("createDriver: anonymous registration only into an active organization", async () => {
  await withDouble({}, async (prismaDouble) => {
    await assert.rejects(
      driverResolver.Mutation.createDriver(
        null,
        registration({ organizationId: "missing" }),
        {}
      ),
      /Организация не найдена/
    )
    assert.equal(prismaDouble.callsTo("driver", "create").length, 0)
  })

  await withDouble(
    { documents: { organization: { id: "org1", active: false } } },
    async () => {
      await assert.rejects(
        driverResolver.Mutation.createDriver(
          null,
          registration({ organizationId: "org1" }),
          {}
        ),
        /Организация не найдена/
      )
    }
  )

  await withDouble(
    { documents: { organization: { id: "org1", active: true } } },
    async (prismaDouble) => {
      await driverResolver.Mutation.createDriver(
        null,
        registration({ organizationId: "org1" }),
        {}
      )
      const [create] = prismaDouble.callsTo("driver", "create")
      assert.equal(create.args.data.organizationId, "org1")
    }
  )
})

test("updateDriver: driver moving himself to another organization loses confirmation", async () => {
  const documents = {
    driver: { id: "A", organizationId: "org1", organizationConfirmed: true },
    organization: { id: "org2", active: true }
  }

  await withDouble({ documents }, async (prismaDouble) => {
    await driverResolver.Mutation.updateDriver(
      null,
      { id: "A", input: { organizationId: "org2" } },
      driverContext("A")
    )
    const [update] = prismaDouble.callsTo("driver", "update")
    assert.equal(update.args.data.organizationId, "org2")
    assert.equal(update.args.data.organizationConfirmed, null)
  })

  await withDouble({ documents }, async (prismaDouble) => {
    await driverResolver.Mutation.updateDriver(
      null,
      { id: "A", input: { organizationId: "org1", name: "Same org" } },
      driverContext("A")
    )
    const [update] = prismaDouble.callsTo("driver", "update")
    assert.equal("organizationConfirmed" in update.args.data, false)
  })

  await withDouble({ documents }, async (prismaDouble) => {
    await driverResolver.Mutation.updateDriver(
      null,
      {
        id: "A",
        input: { organizationId: "org2", organizationConfirmed: true }
      },
      userContext("DISPATCHERADMIN")
    )
    const [update] = prismaDouble.callsTo("driver", "update")
    assert.equal(update.args.data.organizationConfirmed, true)
  })
})

test("needsOrganizationReconfirm: only a real change by a non-manager", () => {
  const current = { organizationId: "org1" }
  const self = driverContext("A")
  assert.equal(needsOrganizationReconfirm({}, current, self), false)
  assert.equal(
    needsOrganizationReconfirm({ organizationId: "org1" }, current, self),
    false
  )
  assert.equal(
    needsOrganizationReconfirm({ organizationId: "org2" }, current, self),
    true
  )
  assert.equal(
    needsOrganizationReconfirm({ organizationId: null }, current, self),
    true
  )
  assert.equal(
    needsOrganizationReconfirm(
      { organizationId: "org2" },
      current,
      userContext("SUPERADMIN")
    ),
    false
  )
})

test("sanitizeDriverInputForSubject: driver may resubmit after rejection and switch himself off", () => {
  const self = driverContext("A")
  assert.deepEqual(
    sanitizeDriverInputForSubject({ registrationStatus: "PENDING" }, self, {
      id: "A",
      registrationStatus: "REJECTED"
    }),
    { registrationStatus: "PENDING" }
  )
  assert.deepEqual(
    sanitizeDriverInputForSubject({ registrationStatus: "PENDING" }, self, {
      id: "A",
      registrationStatus: "APPROVED"
    }),
    {}
  )
  assert.deepEqual(
    sanitizeDriverInputForSubject({ registrationStatus: "APPROVED" }, self, {
      id: "A",
      registrationStatus: "REJECTED"
    }),
    {}
  )
  assert.deepEqual(
    sanitizeDriverInputForSubject({ active: false }, self, { id: "A" }),
    { active: false }
  )
  assert.deepEqual(
    sanitizeDriverInputForSubject({ active: true }, self, { id: "A" }),
    {}
  )
})

test("deleteDriver / deleteDriverTransferPrice: only self or dispatcher", async () => {
  const documents = {
    driver: { id: "B" },
    transferPrice: { id: "tp1", driverId: "B" }
  }
  await withDouble({ documents }, async (prismaDouble) => {
    const { deleteDriver, deleteDriverTransferPrice } = driverResolver.Mutation
    await rejectsWithCode(deleteDriver(null, { id: "B" }, {}), "UNAUTHORIZED")
    await rejectsWithCode(
      deleteDriver(null, { id: "B" }, driverContext("A")),
      "FORBIDDEN"
    )
    await rejectsWithCode(
      deleteDriver(null, { id: "B" }, userContext("AIRLINEADMIN")),
      "FORBIDDEN"
    )
    await rejectsWithCode(
      deleteDriverTransferPrice(null, { id: "tp1" }, driverContext("A")),
      "FORBIDDEN"
    )
    await rejectsWithCode(
      deleteDriverTransferPrice(null, { id: "tp1" }, userContext("HOTELADMIN")),
      "FORBIDDEN"
    )
    assert.equal(prismaDouble.callsTo("driver", "delete").length, 0)
    assert.equal(prismaDouble.callsTo("transferPrice", "delete").length, 0)

    assert.equal(
      await deleteDriverTransferPrice(null, { id: "tp1" }, driverContext("B")),
      true
    )
    await deleteDriver(null, { id: "B" }, userContext("DISPATCHERMODERATOR"))
    assert.equal(prismaDouble.callsTo("driver", "delete").length, 1)
  })
})
