/**
 * One-off: проставляет pricingApprovedAt отчётам ФАП, отправленным до деплоя.
 *
 * Деплой e724a77 добавил PassengerRequestHotelReport.pricingApprovedAt и
 * повесил на него маскировку денег: пока согласования нет, авиакомпании
 * отдаётся состав отчёта без цен (reportRows → maskReportRowPrices,
 * resolvers/passengerRequest/fields.resolver.js). У отчётов, отправленных ДО
 * деплоя, submittedAt заполнен, а pricingApprovedAt пуст — значит авиакомпания
 * разом потеряла бы цены, которые уже видела. Скрипт сохраняет статус-кво: где
 * отчёт отправлен, а согласования нет, согласование ставится задним числом —
 * датой отправки (new Date() выдал бы «сегодня» отчётам любой давности).
 *
 * Отбор ловит не только явный null, но и ОТСУТСТВИЕ поля: pricingApprovedAt
 * появился в схеме тем же деплоем, поэтому у старых документов его в Mongo
 * просто нет, а Prisma-фильтр `{ pricingApprovedAt: null }` на Mongo матчит
 * только явный null — отсюда вторая ветка `isSet: false` (тот же приём, что у
 * flightDate в resolvers/passengerRequest/fields.resolver.js:180).
 *
 * Трогает РОВНО одно поле — pricingApprovedAt. Строки отчёта, submittedAt и
 * любые другие таблицы остаются как есть.
 *
 * Запуск — один раз, после `prisma db push`:
 *   node services/migrations/approvePricingForSubmittedReports.js --dry-run
 *   node services/migrations/approvePricingForSubmittedReports.js
 *
 * Идемпотентен: у согласованных отчётов поле уже не пусто, в выборку они
 * не попадают.
 */
import { pathToFileURL } from "node:url"
import { prisma } from "../../prisma.js"

const DRY_RUN = process.argv.includes("--dry-run")

// Условие отбора для базы. Две ветки по pricingApprovedAt — не перестраховка:
// поле добавлено деплоем e724a77, и в существующих документах его НЕТ, а не
// null; `{ pricingApprovedAt: null }` на Mongo такие документы не находит.
// Так же ловят flightDate (fields.resolver.js:180) и requestNumber
// (scripts/backfill-passenger-request-numbers.js:11-17).
//
// submittedAt, наоборот, нужен ЗАПОЛНЕННЫМ, и здесь хватает `{ not: null }`:
// он даёт $ne: null, а тот отбрасывает и null, и отсутствие поля — та же пара
// приёмов, что в backfill-passenger-request-numbers.js, и то же условие по
// этой модели в services/passengerRequest/envelope.js:224.
//
// Тот же смысл повторён предикатом ниже намеренно: where уходит в запрос, а
// selectReportsToApprove перепроверяет правило уже на готовых документах —
// на нём стоят тесты, и он же страхует, если коннектор отдаст лишнее.
const WHERE = {
  submittedAt: { not: null },
  OR: [{ pricingApprovedAt: null }, { pricingApprovedAt: { isSet: false } }]
}

const FIELDS = {
  id: true,
  passengerRequestId: true,
  hotelIndex: true,
  submittedAt: true,
  pricingApprovedAt: true
}

/** Отправленные, но не согласованные отчёты. Без I/O. */
export const selectReportsToApprove = (reports) =>
  (Array.isArray(reports) ? reports : []).filter(
    (report) => report?.submittedAt != null && report?.pricingApprovedAt == null
  )

/**
 * Что записать в отчёт. Согласование в модели — ДАТА, а не флаг: мутация
 * setPassengerRequestHotelReportPricingApproved пишет new Date(), а бэкфилл
 * пишет дату отправки, чтобы не выдумывать событие, которого не было.
 */
export const approvalDataFor = (report) => ({
  pricingApprovedAt: report.submittedAt
})

const moment = (value) =>
  value instanceof Date ? value.toISOString() : String(value)

export async function run({ dryRun = false, log = console.log } = {}) {
  const reports = await prisma.passengerRequestHotelReport.findMany({
    where: WHERE,
    select: FIELDS
  })
  const selected = selectReportsToApprove(reports)

  let updated = 0
  // Последовательно: параллельная пачка update по одной коллекции ничего не
  // ускорит, зато при обрыве оставит записанной непонятно какую часть.
  for (const report of selected) {
    log(
      `отчёт ${report.id}: заявка ${report.passengerRequestId}, ` +
        `гостиница ${report.hotelIndex}, отправлен ${moment(report.submittedAt)}`
    )
    if (dryRun) continue
    await prisma.passengerRequestHotelReport.update({
      where: { id: report.id },
      data: approvalDataFor(report)
    })
    updated += 1
  }

  log(
    dryRun
      ? `найдено ${selected.length}, обновлено 0 — режим подсчёта, записей не было`
      : `найдено ${selected.length}, обновлено ${updated}`
  )

  return { found: selected.length, updated }
}

async function main() {
  await run({ dryRun: DRY_RUN })
  await prisma.$disconnect()
}

// Соседние миграции зовут main() сразу. Здесь модуль импортируют тесты
// (чистые хелперы), поэтому запуск — только при прямом вызове из консоли.
if (process.argv[1] && pathToFileURL(process.argv[1]).href === import.meta.url) {
  main().catch(async (error) => {
    console.error(error)
    await prisma.$disconnect()
    process.exit(1)
  })
}
