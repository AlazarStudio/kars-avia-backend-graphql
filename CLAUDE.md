# CLAUDE.md — kars-avia-backend-graphql

## Работа с кодом

- Чистый, читаемый, эффективный и поддерживаемый код
- Без оверинжиниринга и лишних абстракций
- Только функциональные компоненты (для React)
- Компоненты маленькие — одна ответственность
- Логика в хуках/утилитах, UI отдельно
- Понятные и единообразные названия
- Перед созданием нового компонента проверь нет ли похожего
- Не дублировать логику — переиспользовать
- Не вносить новые зависимости без явной необходимости
- Всегда анализируй существующую структуру и стиль проекта перед тем как писать код
- Строго следуй архитектуре и паттернам которые уже используются в проекте

## Визуальный стиль

**Если проект уже существует:**
- Проанализируй существующие компоненты, цвета, шрифты, отступы и паттерны
- Строго следуй этой стилистике во всех новых элементах
- Не вноси визуальные изменения если не просят

**Если проект новый:**
- Найди в интернете как выглядят современные сайты или приложения в этой тематике
- Изучи какие цвета, типографику и UI-паттерны используют лидеры в этой нише
- Подбери уникальную палитру под тематику — не шаблонные синий/серый
- Один цвет доминирует (60-70%), один поддерживающий, один акцентный
- Современный дизайн: чистые линии, достаточно воздуха, чёткая иерархия
- Не делай скучно — каждый экран должен выглядеть продуманно и красиво

## Экономия токенов

- Не объясняй что делаешь — просто делай
- Без лишних комментариев и резюме после выполнения
- Если задача понятна — не переспрашивай
- Думай на английском, отвечай на русском


## Project Overview

Enterprise-grade GraphQL API backend for a travel and airline management platform. Manages airlines, hotels, passenger requests, reservations, real-time chat, analytics, reports, and role-based access control.

**Version:** 3.4.0  
**Entry points:** `server2.js` (HTTP, main), `server.js` (HTTPS/SSL, production)

---

## Tech Stack

| Layer | Technology |
|-------|-----------|
| Runtime | Node.js (ES modules, `"type": "module"`) |
| HTTP Framework | Express 4.22 |
| GraphQL | Apollo Server 4.12, graphql-tools/merge |
| ORM | Prisma 6.19 |
| Database | MongoDB ReplicaSet (3 nodes) |
| Auth | JWT + Argon2 + Passport, 2FA (speakeasy) |
| Real-time | GraphQL Subscriptions, WebSocket (ws, graphql-ws) |
| Pub/Sub | In-memory (default) or Redis (graphql-redis-subscriptions) |
| Files | Sharp (images), ExcelJS, PDFKit, graphql-upload |
| Logging | Winston + custom monthly-rotation file logger |
| Process Manager | PM2 (cluster mode) |
| Jobs | node-cron |
| Notifications | Firebase Admin, Nodemailer |

---

## Project Structure

```
├── server.js / server2.js      # Entry points
├── prisma.js                   # Prisma client singleton
├── prisma/schema.prisma        # DB schema (113 models/types/enums)
├── typeDefs/                   # GraphQL type definitions (per domain)
│   └── typedefs.js             # Central merger
├── resolvers/                  # GraphQL resolvers (per domain)
│   └── resolvers.js            # Central merger
├── services/                   # Business logic, utilities, cron, migrations
├── middlewares/
│   ├── authContext.js          # JWT context building
│   └── authMiddleware.js       # Role-based access control
├── src/lib/firebaseAdmin.js    # Firebase initialization
├── generated/client/           # Auto-generated Prisma client (do not edit)
├── tests/                      # Test suites
└── uploads/ reports/ reserve_files/ logs/ backups/  # Runtime directories
```

**Domain modules** (same structure in both `typeDefs/` and `resolvers/`):
`airline`, `airport`, `analytics`, `chat`, `city`, `contract`, `dispatcher`, `documentation`, `driver`, `externalAuth`, `global`, `hotel`, `log`, `organization`, `passengerRequest`, `report`, `representative`, `request`, `reserve`, `support`, `transfer`, `user`

---

## Commands

```bash
# Development
npm run dev          # nodemon on server2.js (auto-reload)
npm run ps           # Prisma Studio (GUI for DB)

# Database
npm run pg           # prisma generate (regenerate client)
npm run pp           # prisma db push (apply schema changes)
npm run pdp          # generate + push + clear console
npm run pdps         # generate + push + clear + studio

# Update workflow (git pull + db sync)
npm run upd          # git pull + pg + pp + clear + studio

# Production
npm start            # node server2.js
npm run pm           # PM2 cluster mode (max instances)
npm run pms          # stop PM2
npm run pmm          # monitor PM2

# Utilities
npm run backup       # database backup script
```

**After schema changes (`prisma/schema.prisma`) always run `npm run pg` to regenerate the client.**

---

## Environment Variables (`.env`)

```env
# Database
DATABASE_URL="mongodb://localhost:27017,localhost:27018,localhost:27019/avia-db?replicaSet=rs0"
OLD_DATABASE_URL="mongodb://localhost:27017,localhost:27018,localhost:27019/avia-db-old?replicaSet=rs0"
DB_NAME="avia-db"

# Server
NODE_ENV="dev"            # "dev" or "production"
WS_KEEPALIVE_MS="12000"  # WebSocket ping interval (optional)

# Security
JWT_SECRET="your-secret-key"
ALLOWED_ORIGINS='["https://domain.com"]'

# Email
EMAIL_ENABLED="false"
EMAIL_USER="noreply@domain.ru"
EMAIL_PASSWORD="smtp-password"
EMAIL_RECEIVER="admin@domain.ru"
EMAIL_KARS="kars@domain.ru"
EMAIL_AVIA="avia@domain.ru"
EMAIL_HOTEL="hotel@domain.ru"

# SSL (for server.js / HTTPS)
SERVER_KEY="/etc/letsencrypt/live/domain/privkey.pem"
SERVER_CERT="/etc/letsencrypt/live/domain/cert.pem"
SERVER_CA="/etc/letsencrypt/live/domain/chain.pem"

# Optional
REDIS_URL="redis://localhost:6379"
FIREBASE_ENABLED="false"    # requires src/lib/fbk.json
```

---

## Architecture Patterns

### GraphQL Organization
- Each domain has its own `typeDefs/<domain>/` and `resolvers/<domain>/` directories.
- Central mergers (`typedefs.js`, `resolvers.js`) combine everything via `@graphql-tools/merge`.
- Adding a new domain: create type/resolver files, import and add to the merger.

### Authentication
- JWT Bearer token validated in `middlewares/authContext.js` → attached to GraphQL context.
- Role-based guards via middleware decorators in resolvers (e.g., `superAdminMiddleware`).
- 12+ roles: `SUPERADMIN`, `AIRLINEADMIN`, `HOTELUSER`, etc.
- `AccessMenu` composite type provides feature-level permission flags per user.
- 2FA: TOTP via speakeasy, QR code generated with `qrcode`.

### Real-time Subscriptions
- WebSocket server embedded in `server.js`/`server2.js`.
- PubSub topics: `AIRLINE_CREATED`, `HOTEL_UPDATED`, `RESERVE_CREATED`, `MESSAGE_SENT`, etc.
- For multi-instance deployments: set `REDIS_URL` to switch to Redis-backed pub/sub.

### Service Layer
- Business logic lives in `services/` — resolvers should be thin, delegating to services.
- Cron jobs in `services/cron/` (backup, archiving).
- Migration scripts in `services/migrations/` for one-off data transformations.

### File Handling
- Protected `/files/*` Express route with JWT validation.
- `uploads/`, `reports/`, `reserve_files/` are excluded from git and nodemon watching.
- Image processing via Sharp; Excel via ExcelJS; PDF via PDFKit.

### Database
- MongoDB ReplicaSet required (3 nodes on 27017/27018/27019).
- Schema-first approach: edit `prisma/schema.prisma`, then run `npm run pg && npm run pp`.
- Prisma client lives in `generated/client/` — never edit manually.

### Logging
- Winston for structured logs.
- Custom monthly-rotation file logger in `services/infra/`.
- Auth errors → `logs/auth.error.log`.

---

## Key Files to Know

| File | Purpose |
|------|---------|
| `prisma/schema.prisma` | Source of truth for all DB models |
| `middlewares/authContext.js` | How JWT is parsed into GraphQL context |
| `middlewares/authMiddleware.js` | Role-checking decorators |
| `resolvers/resolvers.js` | Resolver entry point (merger) |
| `typeDefs/typedefs.js` | TypeDef entry point (merger) |
| `services/infra/` | Logger, PubSub, subscription utilities |
| `server2.js` | Main server: Apollo, Express, WebSocket wiring |

---

## Health Check

`GET /health` — returns `200 OK` when the server is running.

---

## Notes

- `.env` is committed to git with development values. Use environment overrides for production secrets.
- `generated/client/` and `uploads/` are in `.gitignore` — don't commit them.
- Nodemon ignores `uploads/`, `reports/`, `reserve_files/`, `logs/` to avoid restart on file writes.
- Changelog and version history are documented in `README.md` (v0.0.1 → v3.4.0).
