// Точка входа резолверов ФАП: собирает секции из модулей соседних файлов и
// навешивает на них проверку субъекта.

import { mergeResolvers } from "@graphql-tools/merge"
import { withFapAuthGuard } from "../../services/passengerRequest/fapAccess.js"
import fieldsResolvers from "./fields.resolver.js"
import coreResolvers from "./core.resolver.js"
import rosterResolvers from "./roster.resolver.js"
import waterMealResolvers from "./waterMeal.resolver.js"
import livingResolvers from "./living.resolver.js"
import livingMoveResolvers from "./livingMove.resolver.js"
import reportResolvers from "./report.resolver.js"
import transferResolvers from "./transfer.resolver.js"
import baggageResolvers from "./baggage.resolver.js"
import earlyResolvers from "./early.resolver.js"
import subscriptionsResolvers from "./subscriptions.resolver.js"

// АУТЕНТИФИКАЦИЯ. Query, мутации и подписки этого модуля защищены обёрткой
// withFapAuthGuard на экспорте (services/passengerRequest/fapAccess.js): она
// требует, чтобы у вызывающего был субъект допустимого типа. Секции полей
// типов обёрткой не покрыты. Почти все они достижимы только через уже
// защищённые корневые поля модуля; исключение — Notification.passengerRequest
// (dispatcher.resolver.js), но тот путь закрыт активным allMiddleware и
// доступен только субъектам USER.
//
// АВТОРИЗАЦИИ здесь нет: ни ролевых проверок, ни изоляции по авиакомпании.
// Роль проверить нечем — у ExternalUser нет поля role, и любая ролевая
// проверка отбила бы весь PWA, который живёт на магик-линках. Раньше на этом
// месте было 50 закомментированных вызовов middleware, рассыпанных по всему
// модулю; они удалены как вводящие в заблуждение — включение любого из них
// ломает магик-линк.
//
// У подписок проверка одноразовая, в момент subscribe: уже открытый поток
// не перепроверяется, когда токен протухает.
//
// Полноценная авторизация запланирована отдельно. Для гостиниц и водителей
// данные уже есть (ExternalUser.scope/hotelId/driverId), для изоляции по
// авиакомпании — нет.

const passengerRequestResolver = withFapAuthGuard(
  mergeResolvers([
    fieldsResolvers,
    coreResolvers,
    rosterResolvers,
    waterMealResolvers,
    livingResolvers,
    livingMoveResolvers,
    reportResolvers,
    transferResolvers,
    baggageResolvers,
    earlyResolvers,
    subscriptionsResolvers
  ])
)

export default passengerRequestResolver