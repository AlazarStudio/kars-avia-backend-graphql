import { GraphQLError } from "graphql"
import { prisma } from "../../prisma.js"
import { logger } from "../infra/logger.js"
import {
  allMiddleware,
  roleMiddleware
} from "../../middlewares/authMiddleware.js"

// Роли, которые ведут карточки водителей (автопарк, подтверждение регистрации,
// привязка к организации, тарифы).
export const DRIVER_MANAGER_ROLES = [
  "SUPERADMIN",
  "DISPATCHERADMIN",
  "DISPATCHERMODERATOR"
]

// Справочник водителей (DRIVERS_QUERY / GET_ORGANIZATION во фронте):
// диспетчерская, заказ трансфера и ФАП у авиакомпаний, представители.
// Водитель (DRIVER), самостоятельно зарегистрированный USER и сотрудник АК из
// приложения (AIRLINE_PERSONAL) чужих водителей не видят: роль DRIVER получает
// любой через саморегистрацию + transferSignIn.
// Гостиницам справочник не нужен: водителей своей заявки ФАП они видят через заявку (решение владельца 02.10.2026).
export const DRIVER_DIRECTORY_ROLES = [
  ...DRIVER_MANAGER_ROLES,
  "DISPATCHERUSER",
  "AIRLINEADMIN",
  "AIRLINEMODERATOR",
  "AIRLINEUSER",
  "REPRESENTATIVE"
]

// Поля, которые по смыслу выставляет диспетчер: статус регистрации, причина
// отказа, подтверждение в организации, рейтинг, активность и тарифы (тариф
// привязывается к договору организации). Сам водитель и анонимная
// саморегистрация их не задают — кроме переходов из SELF_ALLOWED_TRANSITIONS.
export const DRIVER_SERVICE_FIELDS = [
  "registrationStatus",
  "refusalReason",
  "organizationConfirmed",
  "rating",
  "active",
  "transferPrices"
]

// Безопасные для водителя значения служебных полей: повторная подача после
// отказа (REJECTED → PENDING; при создании PENDING и так по умолчанию) и
// отключение своей учётки. Повысить себе статус так нельзя.
const SELF_ALLOWED_TRANSITIONS = {
  registrationStatus: (value, currentDriver) =>
    value === "PENDING" &&
    (!currentDriver || currentDriver.registrationStatus === "REJECTED"),
  active: (value) => value === false
}

const roleOf = (context) => context?.subject?.role || context?.decoded?.role

export function driverForbiddenError() {
  return new GraphQLError("Access forbidden: Insufficient rights.", {
    extensions: { code: "FORBIDDEN" }
  })
}

export function isDriverManager(context) {
  return (
    context?.subjectType === "USER" &&
    DRIVER_MANAGER_ROLES.includes(context.subject?.role)
  )
}

export function isDriverDirectoryReader(context) {
  return (
    Boolean(context?.subject) && DRIVER_DIRECTORY_ROLES.includes(roleOf(context))
  )
}

export function isDriverSelf(context, driverId) {
  return (
    context?.subjectType === "DRIVER" &&
    Boolean(context.subject?.id) &&
    Boolean(driverId) &&
    String(context.subject.id) === String(driverId)
  )
}

export const canReadDriver = (context, driverId) =>
  isDriverSelf(context, driverId) || isDriverDirectoryReader(context)

// Поездки и переписка водителя — только ему самому и диспетчерской.
export const canReadDriverActivity = (context, driverId) =>
  isDriverSelf(context, driverId) || isDriverManager(context)

// Чтения водителей: справочник — целиком, водитель — только себя
// ({ selfId }), остальным UNAUTHORIZED / FORBIDDEN от roleMiddleware.
export async function resolveDriverReadScope(context) {
  if (context?.subjectType === "DRIVER") {
    await allMiddleware(context)
    return { selfId: String(context.subject.id) }
  }
  await roleMiddleware(context, DRIVER_DIRECTORY_ROLES)
  return { selfId: null }
}

// Organization.drivers — поле без корневого гарда (до него доходят и через
// анонимный createDriver). null — отдать пустой список.
export function organizationDriversWhere(context, organizationId) {
  if (isDriverDirectoryReader(context)) return { organizationId }
  if (context?.subjectType === "DRIVER" && context.subject?.id) {
    return { organizationId, id: String(context.subject.id) }
  }
  return null
}

// Водитель правит только себя, диспетчерские роли — любого. Остальным —
// UNAUTHORIZED / FORBIDDEN от roleMiddleware.
export async function assertCanEditDriver(context, driverId) {
  if (isDriverSelf(context, driverId)) {
    await allMiddleware(context)
    return
  }
  await roleMiddleware(context, DRIVER_MANAGER_ROLES)
}

// currentDriver — карточка до правки (null при создании). Вырезанные поля
// пишутся в warn-лог: приложение водителей, которое их шлёт, видно на стенде.
export function sanitizeDriverInputForSubject(
  input,
  context,
  currentDriver = null
) {
  if (!input || isDriverManager(context)) return input
  const safe = { ...input }
  const dropped = []
  for (const field of DRIVER_SERVICE_FIELDS) {
    if (!(field in safe)) continue
    const allowed = SELF_ALLOWED_TRANSITIONS[field]
    if (allowed?.(safe[field], currentDriver)) continue
    if (safe[field] !== undefined) dropped.push(field)
    delete safe[field]
  }
  if (dropped.length) {
    logger.warn(
      `[driverAccess] dropped service fields ${dropped.join(", ")} ` +
        `(subject: ${context?.subjectType ?? "anonymous"}, ` +
        `driver: ${currentDriver?.id ?? "new"})`
    )
  }
  return safe
}

// Водитель, сменивший себе организацию, снова ждёт подтверждения диспетчера:
// иначе organizationConfirmed=true переехал бы в чужую организацию.
export function needsOrganizationReconfirm(input, currentDriver, context) {
  if (isDriverManager(context) || input?.organizationId === undefined) {
    return false
  }
  return (
    String(input.organizationId ?? "") !==
    String(currentDriver?.organizationId ?? "")
  )
}

// Саморегистрация и смена организации водителем — только в существующую
// активную организацию.
export async function assertOrganizationOpenForDrivers(organizationId) {
  if (!organizationId) return
  const organization = await prisma.organization
    .findUnique({ where: { id: organizationId }, select: { active: true } })
    .catch(() => null)
  if (!organization?.active) throw new Error("Организация не найдена")
}
