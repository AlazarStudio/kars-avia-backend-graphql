# kars-avia-backend-graphql

Kars Avia - История обновлений (Backend)

v0.0.1 (2024-07-10)

Первоначальная настройка проекта.

Добавлены базовые схемы авиакомпаний и запросов.

Обновлен middleware.

v0.2.0 (2024-07-12)

Реализована базовая логика запросов.

v1.0.3 (2024-08-21)

Обновлена схема.

Улучшена работа с запросами.

v1.1.0 (2024-08-26)

Улучшена работа с запросами.

Добавлен чат.

Улучшен сервер.

v1.2.5 (2024-09-09)

Исправлены ошибки сервера.

Улучшена работа с запросами.

v1.2.6 (2024-09-13)

Обновлен функционал авиакомпаний.

v1.2.7 (2024-09-16)

Обновлены схемы отелей и авиакомпаний.

Улучшена работа с подписками.

v1.3.4 (2024-09-23)

Обновлены журналы и отчеты.

Реализована авторизация middleware.

v1.4.9 (2024-09-30)

Улучшена работа с запросами.

Обновлены тестовые данные.

v1.5.0 (2024-10-02)

Обновлена работа подписок.

Улучшена работа сообщений.

v1.6.1 (2024-10-07)

Оптимизирована работа системы.

Улучшены запросы и подписки.

v1.6.2 (2024-10-15)

Переработаны журналы и запросы.

Улучшена работа с отелями.

v1.6.3 (2024-10-22)

Обновлен package.json.

Улучшены логирование и безопасность.

v1.6.4 (2024-11-01)

Оптимизирована работа с датами запросов.

Улучшено управление базой данных.

v1.6.5 (2024-11-14)

Переработаны модели, typedef'ы и резолверы.

Исправлены ошибки в расчетах питания.

v1.6.6 (2024-11-21)

Улучшена безопасность.

Обновлена работа с отчетами.

v1.6.7 (2024-11-28)

Исправлены расчеты питания.

Улучшена работа с отчетами.

v1.6.8 (2024-12-04)

Массовое обновление логики запросов, резервов, архивов.

Оптимизированы логи и схемы отчетов.

v1.6.9 (2024-12-12)

Улучшена поддержка CORS.

Оптимизирована фильтрация отчетов и подписок.

v1.7.0 (2024-12-21)

Улучшена работа пагинации.

Обновлены отчеты.

v1.7.1 (2024-12-26)

Добавлен суппорт-чат.

Улучшена схема отчетов.

v1.7.2 (2025-01-09)

Исправлены ошибки подписок.

Улучшена логика загрузки изображений.

v1.7.3 (2025-01-17)

Улучшена работа схем.

Добавлен бэкап данных.

Обновлена логика загрузки изображений.

v1.7.4 (2025-01-22)

Улучшена работа с чатами и логами.

Обновлены схемы подписок.

v1.7.5 (2025-01-28)

Исправлены ошибки работы чатов.

Улучшена проверка прав доступа.

v1.7.9 (2025-01-29)

Оптимизированы запросы и отчеты.

v1.8.0 (2025-02-14)

Обновление схем; Перенос категорий, цен, описания в отдельные типы; Обновление сообщений и чатов; Перенос питания из заявки в шахматку; Обновление подсчёта цен, питания, дней; Обновление проверки дублирования заявок; Обновление создания и получения отчётов(не все фильтры реализованы); Обновление создания заявок; Убраны лишние коментарии, логирование; Глобальная переработка резерва; Добавлены дополнительные проверки ролей и доступа; Добавлена утилита для переноса данных из старой версии бд(не доработано)Обновление схем; Перенос категорий, цен, описания в отдельные типы; Обновление сообщений и чатов; Перенос питания из заявки в шахматку; Обновление подсчёта цен, питания, дней; Обновление проверки дублирования заявок; Обновление создания и получения отчётов(не все фильтры реализованы); Обновление создания заявок; Убраны лишние коментарии, логирование; Глобальная переработка резерва; Добавлены дополнительные проверки ролей и доступа;

Изменения в **schema.prisma**:

- Обновлены модели основных сущностей (Airline, Hotel, Request, Reserve, HotelChess, Passenger, User).
- Поля контактной информации (country, city, address, и пр.) объединены в составной тип **Information**.
- Поля для питания (ранее MealPrice) теперь вынесены в отдельный тип **MealPrice**.
- Добавлен новый составной тип **Price** для тарифов (priceOneCategory ... priceTenCategory).
- Определены типы для плана питания – **MealPlan** с вложенными **DailyMeal**.

Изменения в GraphQL-схемах (typeDefs):

- **hotel.typeDef.js**:

  - Обновлены типы и входные типы для отеля: теперь используется составной тип **Information**, а также новые типы **MealTime**, **MealPrice**, **MealPlan** и **Price**.
  - Модель **HotelChess** изменена: вместо поля room (строка) используется связь с моделью **Room** через поле **roomId** (и резольвер для поля room настроен через findUnique по roomId).

- **reserve.typeDef.js**:
  - В входных типах для создания и обновления резерва удалено поле **person** (больше нельзя добавлять персон в резерв).
  - Обновлены типы резерва, чтобы корректно отражать составные типы питания.

Изменения в резольверах:

- **hotel.resolver.js**:

  - В мутации **updateHotel** исправлена логика обработки массива **hotelChesses**:
    - При обновлении существующей записи вместо прямой установки `roomId` теперь используется nested connect (поле `room: { connect: { id: hotelChess.roomId } }`), что корректно связывает запись с моделью **Room**.
    - Добавлено вычисление плана питания через функцию **calculateMeal** – план питания сохраняется в поле **mealPlan**.
    - При создании новой записи в **HotelChess** аналогичным образом используется nested connect для поля room.
  - Обновление логирования и публикации событий через **pubsub**.

- **reserve.resolver.js**:

  - Убрана возможность добавлять поле **person** в резерв (входные типы обновлены).
  - Мутация **updateReserve** теперь после обновления резерва перебирает связанные записи **hotelChess** и пересчитывает для них план питания (используя calculateMeal с новыми датами), затем обновляет каждую запись.
  - Остальные операции (создание резерва, добавление пассажиров, привязка отеля, архивирование) остаются без изменений, но теперь логика обработки резерва соответствует новой схеме.

- **user.resolver.js**:

  - Обновлена логика регистрации, входа, обновления пользователя, поддержки двухфакторной аутентификации (2FA) с использованием speakeasy, генерации и проверки QR-кода и email-уведомлений.
  - Добавлена обработка refreshToken и logout.

- **calculateMeal.js**:
  - Функция расчёта плана питания реализована для вычисления количества завтраков, обедов и ужинов за период между датами прибытия и выезда, с формированием массива dailyMeals.

Добавлен скрипт миграции (не представлен полностью, но описан в документации):

- Скрипт migration.js для преобразования данных из старой схемы в новую с учетом объединения полей в составные типы (например, Information, Price, MealPlan).
- Реализована карта соответствий между старыми и новыми полями, что позволяет безопасно перенести данные из бэкапа.

Общие изменения:

- Унифицированы имена полей и типы во всех модулях (Prisma, GraphQL, резольверы).
- Добавлены проверки существования связанных записей (например, проверка наличия комнаты по roomId).
- Улучшено логирование действий и публикация событий через PubSub.

v1.8.2 (2025-02-23)

Обновление схем; Обновление загрузки файлов; Переработка отчётов; Добавление новых уведомлений; Доработка старых уведомлений; Переработка запроса на продление заявок; Переработка обновления шахматки и питания при обновлении заявок; Обновление времени в логах/чатах; Обновление прав в резольверах;

- **reserve.resolver.js**:

  - При обновлении заявки на резерв аккаунтом авиакомпании отправляется запрос диспетчеру в виде уведомления который так же дублируется в чат заявки
  - Обновление текста логирования

- **request.resolver.js**:

  - При обновлении заявки на резерв аккаунтом авиакомпании отправляется запрос диспетчеру в виде уведомления который так же дублируется в чат заявки
  - Обновление текста логирования

- **hotel.resolver.js**:

  - Обновление текста логирования

- **user.resolver.js**:

  - Обновление редактирования пользователя
  - Верификация старого пароля
  - Отправка сообщений на почту

- **dispatcher.typeDef.js**:

  - Добавление новых типов подписок
  - Обновление старых подписок

- **chat.typeDef.js**, **request.typeDef.js**, **reserve.typeDef.js**:
  - Добавление новых разграничителей

Общие изменения:

- Изменение архивирования заявок
- Обновление поиска по статусам
- Обновление экспортёра
- Улучшение взаимосвязей в некоторых резольверах

v1.8.3 (2025-02-25)

Иправлена ошибка формирования номера заявок (из-за ошибки при неправильном формировании номера, заявка не создавалась)

Переработано получение чатов (была ошибка при получении чата в резерве для отеля)

Добавлена функция формирования списка пассажиров (генерация xlsx)

Добавлена функция конвертации xlsx в pdf (нужна доработка и дополнительные тесты)

Добавлена функция сброса пароля (необходимо добавить страницу на фронте)

Переработаны функции добавления и удаления файлов

v1.8.3-1 (2025-02-26) hot fix

- Были выявлены проблемы
  - При загрузке файлов определённых типов сервер перезапускался (исправлено)
  - Сброс цен в отеле и авиакомпании при обновлении данных (исправлено)

Общие изменения:

- Исправлено логирование действий на сайте
- К логам добавлено выделение
- Удалены уязвимыые зависимости
- Удалены неиспользуемые функции и файлы

v1.8.4 (2025-03-09)

- main

  - Добавлен контекст для подписок

  - Изменён контекст для запросов

  - Оптимизация потребления памяти и нагрузки на процессор

- **schema.prisma**:

  - Добавлена схема для уведомлений

  - Незначительные изменения в других схемах

- **chat.typeDef.js**, **request.typeDef.js**, **reserve.typeDef.js**, **hotel.resolver.js**:

  - Формирование и отправка уведомлений

  - Оптимизация получения данных

  - Оптимизация подписок

v1.9.0 (2025-03-21)

Общие изменения:

- Логи вынесены в отдельную модель
- Добавлена пагинация для логов
- Отправка сообщений на почту была доработана
- Полностью переработано удаление

- **log.typeDef.js**:

  - Новая схема для логов

- **log.resolver.js**:

  - Новый резольвер для логов

- **request.resolver.js**:

  - Изменена проверка ролей
  - Доработано продление и обновление заявки

- **reserve.resolver.js**:

  - Изменена проверка ролей
  - Доработано обновление заявки
  - Изменено проверка и логирование при добавлении манифеста

- **hotel.resolver.js**:

  - Отправка сообщений на почту при бронировании
  - Довлены кровати
  - Переработано удаление
  - Переработка логов + пагинация

- **airline.resolver.js**:

  - Добавлена почта для отделов
  - Переработано удаление
  - Переработка логов + пагинация

- **report.resolver.js**:
  - Добавлено удаление отчёта
  - Переработан отчёт для отелей


v1.9.1 (2025-03-22)

Общие изменения:

  - Квартиры теперь являются категорией для отелей
  - Цены для квартир указываются в комнатах (отдельные квартиры)
  - Для авиакомпаний добавлены 2 новые категории цен (апартаменты, студия)
  - Доработаны отчёты под текущие изменения