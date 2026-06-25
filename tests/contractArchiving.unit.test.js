import {
  buildExpiredNoProlongationWhere,
  appendArchiveFilter
} from "../services/contract/contractArchive.js"
import { getContractExpirationMeta } from "../services/contract/contractExpiration.js"

const assert = (condition, message) => {
  if (!condition) throw new Error(message)
}

const now = new Date("2025-06-25T12:00:00.000Z")

const contractWhere = buildExpiredNoProlongationWhere(now, "contractEndDate")
assert(contractWhere.isProlongationEnabled === false, "prolongation must be false")
assert(contractWhere.contractEndDate.lt instanceof Date, "must compare end date")
assert(
  getContractExpirationMeta("2025-06-24T23:59:59.000Z", now).isExpired,
  "yesterday must be expired"
)
assert(
  !getContractExpirationMeta("2025-06-25T00:00:00.000Z", now).isExpired,
  "today must not be expired"
)

const agreementWhere = buildExpiredNoProlongationWhere(now, "agreementEndDate")
assert(agreementWhere.agreementEndDate !== undefined, "agreement field must be used")

const activeFilter = []
appendArchiveFilter({}, activeFilter)
assert(activeFilter[0].isArchived.not === true, "active list excludes archived")

const archivedFilter = []
appendArchiveFilter({ archived: true }, archivedFilter)
assert(archivedFilter[0].isArchived === true, "archived list includes archived only")

console.log("contract archiving unit checks passed")
