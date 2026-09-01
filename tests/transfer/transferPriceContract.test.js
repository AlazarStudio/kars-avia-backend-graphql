import test from "node:test"
import assert from "node:assert/strict"
import { organizationContractData } from "../../services/transfer/transferPriceContract.js"
import { installPrismaDouble } from "../helpers/prismaDouble.js"

test("organizationContractData: нет договора — ошибка", async () => {
  const double = installPrismaDouble({ documents: {} })
  try {
    await assert.rejects(
      () => organizationContractData("missing", "org-1"),
      /не найден/
    )
  } finally {
    double.restore()
  }
})


test("organizationContractData: пустое значение сбрасывает связь", async () => {
  assert.deepEqual(await organizationContractData(null, "org-1"), {
    organizationContractId: null
  })
  assert.deepEqual(await organizationContractData("", "org-1"), {
    organizationContractId: null
  })
})

test("organizationContractData: чужой поставщик — ошибка", async () => {
  const double = installPrismaDouble({
    documents: {
      organizationContract: {
        id: "c1",
        organizationId: "org-other"
      }
    }
  })
  try {
    await assert.rejects(
      () => organizationContractData("c1", "org-1"),
      /другому поставщику/
    )
  } finally {
    double.restore()
  }
})

test("organizationContractData: свой договор проходит", async () => {
  const double = installPrismaDouble({
    documents: {
      organizationContract: {
        id: "c1",
        organizationId: "org-1"
      }
    }
  })
  try {
    assert.deepEqual(await organizationContractData("c1", "org-1"), {
      organizationContractId: "c1"
    })
  } finally {
    double.restore()
  }
})
