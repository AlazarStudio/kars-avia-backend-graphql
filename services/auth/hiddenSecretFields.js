// Хеш пароля, refresh-токен сессии, отпечаток устройства и секрет 2FA лежат
// в тех же prisma-объектах, что уходят в ответ GraphQL. Поля остаются в схеме,
// чтобы старые клиенты, которые их запрашивают, получали null, а не ошибку
// валидации; field-резолвер прячет значение только в ответе — серверная логика
// (signIn, refreshToken, authContext) читает prisma-объекты и не затрагивается.

export const USER_SECRET_FIELDS = [
  "password",
  "twoFASecret",
  "refreshToken",
  "fingerprint"
]

export const SESSION_SECRET_FIELDS = ["password", "refreshToken", "fingerprint"]

// Копия ссылок входа внешней учётки гостиницы (сырой токен) в карточке
// гостиницы. Не отдаётся никому: ссылки диспетчер берёт из заявки ФАП
// (resolvers/passengerRequest/fields.resolver.js), а карточку читает любой
// вошедший (ПДН-Е-07). Поля остаются в схеме, чтобы старые запросы не падали.
export const HOTEL_LOGIN_LINK_FIELDS = ["externalLinkCRM", "externalLinkPWA"]

export function hideSecretFields(fieldNames) {
  return Object.fromEntries(fieldNames.map((name) => [name, () => null]))
}

// Для ответов, где резолвер типа не спасает: AuthPayload.refreshToken легитимен
// у signIn / refreshToken (токен получает владелец), поэтому мутация, которая
// возвращает в AuthPayload чужой prisma-объект, снимает секреты сама.
export function omitSecretFields(entity, fieldNames = USER_SECRET_FIELDS) {
  if (!entity) return entity
  const safe = { ...entity }
  for (const name of fieldNames) delete safe[name]
  return safe
}
