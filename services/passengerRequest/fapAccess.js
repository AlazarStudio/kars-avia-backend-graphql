// Аутентификация ФАП. Здесь стоит ТОЛЬКО проверка «субъект есть и он не
// публичный» — это аутентификация, а не авторизация.
//
// Ролевых проверок здесь нет и не будет до отдельной работы по авторизации:
// у модели ExternalUser нет поля role, а roleMiddleware построен на роли.
// Любой ролевой middleware вернул бы FORBIDDEN и убил бы весь PWA гостиниц
// и водителей, работающий по магик-линку.
//
// До этой обёртки запрос БЕЗ заголовка Authorization доходил до резолвера и
// выполнялся: buildAuthContext при пустом заголовке отдаёт пустой контекст
// без исключения, а активных middleware в модуле ноль.
//
// Обёртка навешивается один раз на экспорте резолвера, а не вставкой в каждую
// мутацию: так она покрывает и те мутации, у которых нет даже
// закомментированной строки, и её невозможно забыть при добавлении новой.

import { GraphQLError } from "graphql"

// Белый список, а не чёрный: неизвестный тип субъекта должен получать отказ,
// а не проходить. Перечислены все аутентифицированные типы, которые заводит
// buildAuthContext.
//
// Сознательно отсутствует HOTEL_PREVIEW: это ПУБЛИЧНЫЙ субъект —
// authorizeHotelPreview меняет ссылку-превью на JWT вообще без аутентификации,
// поэтому его наличие в контексте не означает права трогать заявки. Остальной
// код обращается с ним так же ограничительно (hotelPreviewMiddleware,
// checkFileAccess).
const ALLOWED_SUBJECT_TYPES = new Set([
  "USER",
  "EXTERNAL_USER",
  "DRIVER",
  "AIRLINE_PERSONAL"
])

export function assertFapSubject(context) {
  if (!context?.subject) {
    throw new GraphQLError("Unauthorized", {
      extensions: {
        code: "UNAUTHENTICATED",
        http: { status: 401 }
      }
    })
  }
  if (!ALLOWED_SUBJECT_TYPES.has(context.subjectType)) {
    // Субъект есть и токен валиден — просто этот тип не имеет отношения к ФАП.
    // Отдаём FORBIDDEN, а не UNAUTHENTICATED: клиентский authErrorLink считает
    // UNAUTHENTICATED восстановимым, потратит попытку refresh и, провалив её,
    // очистит сессию и уведёт на логин — то есть выкинет посетителя со
    // страницы вместо внятного отказа.
    throw new GraphQLError("Forbidden", {
      extensions: {
        code: "FORBIDDEN",
        http: { status: 403 }
      }
    })
  }
}

// Обёртка асинхронная просто потому, что резолверы ФАП и так асинхронны — она
// не меняет их контракт. Для graphql-js разницы нет: синхронный бросок и
// отклонённый промис он обрабатывает одинаково. Подписка ниже, наоборот,
// синхронна — там отказать нужно ДО создания итератора.
const guardResolver = (fn, operationName) =>
  async function guarded(parent, args, context, info) {
    assertFapSubject(context)
    // Имя операции кладём в контекст здесь: обёртка — единственное место, где
    // оно известно даром. Иначе пришлось бы протаскивать его через все 48
    // вызовов конверта мутации ради одной строки лога.
    if (context) context.fapOperation = operationName
    return fn.call(this, parent, args, context, info)
  }

// Защитный механизм обязан падать на неожиданной форме, а не пропускать её:
// graphql-tools допускает объектную форму поля ({ resolve }), и такое поле
// прошло бы мимо охраны молча.
const guardSection = (section, sectionName) =>
  Object.fromEntries(
    Object.entries(section).map(([name, value]) => {
      if (typeof value !== "function") {
        throw new TypeError(
          `ФАП, ${sectionName}.${name}: ожидалась функция-резолвер, получено ${typeof value}`
        )
      }
      return [name, guardResolver(value, `${sectionName}.${name}`)]
    })
  )

// Подписка — это объект { subscribe }, а не функция. Спред сохраняет соседние
// поля записи (resolve и прочие), меняется только subscribe.
const guardSubscriptions = (section) =>
  Object.fromEntries(
    Object.entries(section).map(([name, definition]) => {
      if (typeof definition?.subscribe !== "function") {
        throw new TypeError(
          `ФАП, Subscription.${name}: ожидался объект с функцией subscribe`
        )
      }
      return [
        name,
        {
          ...definition,
          subscribe: (parent, args, context, info) => {
            assertFapSubject(context)
            return definition.subscribe(parent, args, context, info)
          }
        }
      ]
    })
  )

export function withFapAuthGuard(resolvers) {
  return {
    ...resolvers,
    ...(resolvers.Query && { Query: guardSection(resolvers.Query, "Query") }),
    ...(resolvers.Mutation && {
      Mutation: guardSection(resolvers.Mutation, "Mutation")
    }),
    ...(resolvers.Subscription && {
      Subscription: guardSubscriptions(resolvers.Subscription)
    })
  }
}
