# Инструкция по тестированию Firebase уведомлений

## 1. Проверка инициализации Firebase

При запуске приложения проверьте логи. Должно появиться одно из сообщений:

**✅ Успешная инициализация:**
```
[FIREBASE] Initialized with service account from <путь к файлу>
```

**❌ Неуспешная инициализация:**
```
[FIREBASE] Service account not found. Firebase notifications will be disabled.
```

## 2. Тестирование отправки уведомления

### Способ 1: Через отправку сообщения в чат трансфера

1. Отправьте сообщение в чат трансфера через мутацию `sendTransferMessage`
2. Проверьте логи - должны появиться сообщения:
   ```
   [FIREBASE] Sending notification to user <userId> (<количество> devices)
   [FIREBASE] Multicast message sent. Success: <число>, Failure: <число>
   ```

### Способ 2: Через тестовый скрипт

Создайте файл `test-firebase.js` в корне проекта и запустите:
```bash
node test-firebase.js <userId>
```

Где `<userId>` - ID пользователя, которому нужно отправить тестовое уведомление.

## 3. Просмотр статистики в Firebase Console

1. Откройте [Firebase Console](https://console.firebase.google.com/)
2. Выберите проект: `notification-kars-drive`
3. В боковом меню найдите **"Engage" → "Cloud Messaging"** (или "Участие" → "Облачные сообщения")
4. В разделе **"Campaigns"** или **"Reports"** вы можете увидеть:
   - Количество отправленных сообщений
   - Статистику успешных/неуспешных отправок
   - Время отправки

**Примечание:** Firebase Console показывает только статистику кампаний, отправленных через Console UI. Для просмотра сообщений, отправленных через Admin SDK, используйте логи приложения.

## 4. Проверка в логах приложения

Все операции с Firebase логируются с префиксом `[FIREBASE]`:

- `[FIREBASE] Message sent successfully: <messageId>` - успешная отправка
- `[FIREBASE] Multicast message sent. Success: X, Failure: Y` - результат массовой отправки
- `[FIREBASE] Error sending message to token <token>` - ошибка отправки
- `[FIREBASE] Removed invalid token from database` - удаление невалидного токена

## 5. Проверка токенов в базе данных

Убедитесь, что у пользователя есть токены устройств в таблице `device_tokens`:

```sql
SELECT * FROM device_tokens WHERE userId = '<userId>';
```

Или через Prisma Studio:
```bash
npx prisma studio
```

## 6. Частые проблемы

### Firebase не инициализирован
- Проверьте, что файл `services/service_account.json` существует
- Проверьте формат JSON файла
- Проверьте права доступа к файлу

### Токен не найден
- Убедитесь, что пользователь зарегистрировал токен устройства
- Проверьте таблицу `device_tokens` в базе данных

### Ошибка отправки
- Проверьте логи на наличие ошибок
- Убедитесь, что токен актуален (невалидные токены автоматически удаляются)

