# Защищенная система доступа к файлам

## Обзор

Система обеспечивает защищенный доступ к файлам через JWT авторизацию и проверку прав доступа.

## Как это работает

### 1. Автоматическая нормализация путей

Все резольверы автоматически преобразуют пути к файлам в защищенный формат:

**Старый формат (в БД):**
```
/uploads/misc/2025/12/17/file.xlsx
/reports/report.xlsx
/reserve_files/reserve_123_file.xlsx
```

**Новый формат (возвращается клиенту):**
```
/files/uploads/misc/2025/12/17/file.xlsx
/files/reports/report.xlsx
/files/reserve_files/reserve_123_file.xlsx
```

### 2. Field Resolvers

Автоматически применяются для следующих типов:
- `Request.files`
- `Reserve.files` и `Reserve.passengerList`
- `AirlineContract.files`
- `HotelContract.files`
- `OrganizationContract.files`
- `AdditionalAgreement.files`
- `User.images`
- `AirlinePersonal.images`
- `Driver.documents`
- `Hotel.images`
- `Organization.images`
- `ReportFile.url`

### 3. Доступ к файлам

**Требования:**
- JWT токен в заголовке `Authorization: Bearer <token>`
- Права доступа к файлу (проверяются автоматически)

**Пример запроса:**
```http
GET /files/uploads/requests/123/2024/01/15/file.png
Authorization: Bearer <JWT_TOKEN>
```

### 4. Логика проверки прав

- **SUPERADMIN и диспетчеры** - доступ ко всем файлам
- **Пользователи авиакомпаний** - доступ к файлам своей авиакомпании
- **Отели** - доступ к файлам связанных заявок/резервов
- **Пользователи** - доступ к своим файлам и файлам своей авиакомпании

## Обратная совместимость

Система поддерживает оба формата путей:
- Старые пути из БД (`/uploads/...`) автоматически преобразуются
- Новые пути (`/files/uploads/...`) работают напрямую
- Роут `/files/*` принимает оба формата

## Примеры использования

### GraphQL запрос
```graphql
query HotelContracts($pagination: ContractPaginationInput) {
  hotelContracts(pagination: $pagination) {
    items {
      id
      files  # Автоматически вернет пути с префиксом /files/
    }
  }
}
```

### Ответ
```json
{
  "data": {
    "hotelContracts": {
      "items": [
        {
          "id": "6942a3110461d798383cd906",
          "files": [
            "/files/uploads/misc/2025/12/17/1765974801444.xlsx"
          ]
        }
      ]
    }
  }
}
```

### HTTP запрос файла
```javascript
fetch('/files/uploads/misc/2025/12/17/1765974801444.xlsx', {
  headers: {
    'Authorization': `Bearer ${jwtToken}`
  }
})
```

## Файлы системы

- `services/files/normalizeFilePaths.js` - утилита для нормализации путей
- `services/files/checkFileAccess.js` - проверка прав доступа
- `services/routes/files.js` - защищенный роут для файлов
- `resolvers/filePaths/filePaths.resolver.js` - field resolvers для нормализации
