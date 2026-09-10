// Отбор списка заявок ФАП по стадии согласования отчёта.
//
// В where такое условие не выражается: стадия считается по ВИДИМЫМ гостиницам
// заявки, а гостиница без сохранённого отчёта стоит на нулевой стадии —
// сравнить длину встроенного массива hotels с числом связанных записей
// hotelReports Prisma не умеет. Поэтому кандидаты сужаются запросом настолько,
// насколько это выразимо, стадия считается в памяти, и страница нарезается там
// же. Лишнее обращение в базу — цена честной пагинации: отбрасывать строки уже
// после skip/take значило бы отдавать дырявые страницы.

import { prisma } from "../../prisma.js"
import { hydratePassengerRequest } from "./hydratePassengerRequest.js"
import {
  passengerReportStageIndex,
  requestReportStage
} from "./hotelReportStage.js"

// Кандидату нужны только принадлежность гостиниц (для видимости) и отметки
// отчётов. Строки отчёта тяжёлые и здесь не читаются.
const CANDIDATE_SELECT = {
  id: true,
  livingService: { select: { hotels: { select: { hotelId: true } } } },
  hotelReports: {
    select: {
      hotelIndex: true,
      submittedAt: true,
      pricingApprovedAt: true,
      airlineApprovedAt: true
    }
  }
}

// Сужения, выразимые в базе. Заявка без гостиниц стадии не имеет вовсе, а любая
// стадия выше нулевой требует хотя бы одного отправленного отчёта.
const narrowCandidates = (stage) => {
  const clauses = [{ livingService: { is: { hotels: { isEmpty: false } } } }]
  if (stage > 0) {
    clauses.push({ hotelReports: { some: { submittedAt: { not: null } } } })
  }
  return clauses
}

export async function listByReportStage({ where, stage, scope, skip, take }) {
  const target = passengerReportStageIndex(stage)
  const candidates = await prisma.passengerRequest.findMany({
    where: { AND: [where, ...narrowCandidates(target)] },
    orderBy: { createdAt: "desc" },
    select: CANDIDATE_SELECT
  })

  const matched = candidates.filter(
    (candidate) =>
      requestReportStage(scope, candidate, candidate.hotelReports) === target
  )

  // Пагинация повторяет базовую ветку буквально: потолка take нет, take: 0
  // просит пустую страницу, отсутствующие значения означают «с начала и до
  // конца» (см. характеризационные тесты списка).
  const from = skip ?? 0
  const ids = matched
    .slice(from, take == null ? undefined : from + take)
    .map((candidate) => candidate.id)
  if (ids.length === 0) return []

  const list = await prisma.passengerRequest.findMany({
    where: { id: { in: ids } },
    orderBy: { createdAt: "desc" }
  })
  return list.map(hydratePassengerRequest)
}
