# Graph Report - C:\git back\kars-avia-backend-graphql  (2026-08-24)

## Corpus Check
- cluster-only mode — file stats not available

## Summary
- 1882 nodes · 5216 edges · 90 communities (70 shown, 20 thin omitted)
- Extraction: 95% EXTRACTED · 5% INFERRED · 0% AMBIGUOUS · INFERRED: 278 edges (avg confidence: 0.84)
- Token cost: 51,412 input · 1,340 output

## Graph Freshness
- Built from commit: `0b9711c4`
- Run `git rev-parse HEAD` and compare to check if the graph is stale.
- Run `graphify update .` after code changes (no API cost).

## Community Hubs (Navigation)
- Data Backfill & Travelline
- Analytics & Request Aggregation
- External Auth & File Access
- Bulk Request Import
- Docker Stack Deployment
- Email & Push Notifications
- Server Entry & Auth Middleware
- System Updates & Maintenance Banner
- Bot Service & Webhooks
- FAP Scope & Subscriptions
- Room Occupancy Overlap
- Price Geography Conflicts
- Push Notification Delivery
- Passenger Request Mutations
- Global Resolvers & Logs
- Cron Jobs & Backups
- GraphQL Schema & Resolvers
- Roster & Saved Passengers
- Passenger Document Recognition
- Backend Dependencies
- Request Cost Allocation
- Protected File Storage Routes
- Role-based Auth Middleware
- Airline Analytics Builders
- Request Pricing Calculation
- Patch No-op Detection
- Access Menu Permissions
- Real-time PubSub Subscriptions
- Baggage Delivery Normalization
- Passenger Request Resolver
- Documentation Tree & Backfill
- Prisma Workflow & Scripts
- Contract Archiving
- Log Action Diffing
- Report Draft & Share Metadata
- Backend Tech Stack
- Request & Reserve Module
- Backend Health & Conventions
- Upload File Migration
- Support Chat & Documentation
- Price Location Resolution
- Contract Resolver & Filters
- Water/Meal & Bulk Hotel People
- Passenger Request Emails
- Contract Expiration Sorting
- Request Email Templates
- File Upload & Deletion
- Living Resolver & Hotel Chess
- Report XLSX/PDF Exporter
- Rate Limiting Library
- Driver Resolver & Image Upload
- GraphQL Subscriptions Library
- Contract File Management
- Passenger Groups & Hotel Items
- Airline Service Comparison
- Archetype Library
- Positions & Dispatcher Resolver
- Transfer & Baggage Normalizers
- Partial-day Settings Rules
- One-off Migration Scripts
- Transfer Resolver & PubSub
- Airline & Hotel Resolvers
- GraphQL Auth Context
- Redis Client Library
- Mpath Library
- FAP Access Guards
- Winston File Logger
- CORS Library
- Stream Promise Library
- UUID Library
- File Saver Library
- Document Generation Libraries
- Contract File Migration
- Package Config & Nodemon
- GraphQL Tools Schema
- FAP Scope Readiness Check
- TOTP Two-factor Auth
- Max Bot API
- Chess Helpers
- Price Geography Normalization Tests
- Passenger Hotel Address Backfill
- Airline Price Geography Migration
- Price Search Location Tests
- Express Session
- Fast Glob
- GraphQL Passport
- Punycode
- Winston Logger
- Winston MongoDB

## God Nodes (most connected - your core abstractions)
1. `prisma` - 107 edges
2. `TravellineService` - 49 edges
3. `installPrismaDouble()` - 42 edges
4. `pubsub` - 31 edges
5. `logger` - 30 edges
6. `makeRequest()` - 28 edges
7. `allMiddleware()` - 26 edges
8. `BotService` - 25 edges
9. `installPubsubSpy()` - 25 edges
10. `aggregatePassengerRequest()` - 19 edges

## Surprising Connections (you probably didn't know these)
- `Redis-backed pub/sub for multi-instance` --references--> `@graphql-yoga/redis-event-target`  [INFERRED]
  CLAUDE.md → package.json
- `Redis-backed pub/sub for multi-instance` --references--> `ioredis`  [INFERRED]
  CLAUDE.md → package.json
- `Real-time GraphQL subscriptions` --references--> `wsServer`  [INFERRED]
  CLAUDE.md → server2.js
- `Meal plan calculation (MealPlan / DailyMeal)` --shares_data_with--> `calculateMealCost()`  [INFERRED]
  README.md → services/report/reports.js
- `Environment variable contract (.env)` --references--> `serviceAccountPath`  [INFERRED]
  CLAUDE.md → src/lib/firebaseAdmin.js

## Import Cycles
- None detected.

## Hyperedges (group relationships)
- **Protected file access pipeline** — readme_file_access_control, services_files_readme_secure_file_access_system, services_files_checkfileaccess, services_files_normalizefilepaths, services_routes_files, resolvers_filepaths_filepaths_resolver [INFERRED 0.85]
- **Contract lifecycle management** — readme_contracts_module, readme_contract_auto_archiving, services_cron_contractarchiving, services_contract_contractarchive, services_contract_contractfilters [INFERRED 0.80]
- **System update notification pipeline** — readme_system_update_notifications, readme_semver_gating, services_site_systemupdate, services_site_systemupdateutils, resolvers_site_site_resolver [INFERRED 0.80]
- **JWT auth, role middleware, and AccessMenu forming the access-control flow** — claude_authentication_architecture, claude_role_based_access_control, claude_access_menu, middlewares_authcontext, middlewares_authmiddleware [INFERRED 0.85]
- **Three-container Docker Compose deployment topology** — install_docker_compose_stack, install_karsavia_frontend_service, install_karsavia_backend_service, install_karsavia_mongo_service, docker_compose_karsavia_stack [EXTRACTED 1.00]
- **Real-time subscription and PubSub mechanism (in-memory or Redis)** — claude_realtime_subscriptions, claude_pubsub_topics, claude_redis_pubsub_switch, services_infra_pubsub, services_infra_pubsub_rediseventtargetpubsub [INFERRED 0.85]
- **KarsAvia Docker Stack Topology** — docker_compose_karsavia_stack, docker_compose_mongo, docker_compose_mongo_init, docker_compose_backend, docker_compose_frontend [EXTRACTED 1.00]
- **Telegram Support Message Data Flow Stages** — shema_potoka_dannyh_telegram_message_flow, shema_potoka_dannyh_incoming_message_stage, shema_potoka_dannyh_message_persistence, shema_potoka_dannyh_pubsub_publish, shema_potoka_dannyh_admin_ui_subscription, shema_potoka_dannyh_admin_reply, shema_potoka_dannyh_outbound_delivery [EXTRACTED 1.00]

## Communities (90 total, 20 thin omitted)

### Community 0 - "Data Backfill & Travelline"
Cohesion: 0.05
Nodes (24): backfillRequests(), backfillReserves(), main(), resolveDepartmentFromRecord(), APPLY, findLastOpenIndex(), isOpen(), main() (+16 more)

### Community 1 - "Analytics & Request Aggregation"
Cohesion: 0.07
Nodes (54): dispatcherOrSuperAdminMiddleware(), Analytics module, analyticsResolver, analyticsUserRequests(), AverageApplicationProcessingTime(), AverageRequestReviewTime(), buildWhereConditionsRequests(), countRequestsByStatus() (+46 more)

### Community 2 - "External Auth & File Access"
Cohesion: 0.06
Nodes (66): JWT-protected /files/* route, hotelPreviewMiddleware(), External auth via magic link, File access control and path normalization, Hotel preview links, buildExternalAuthPayload(), EXTERNAL_ACCESS_TYPES, EXTERNAL_SCOPES (+58 more)

### Community 3 - "Bulk Request Import"
Cohesion: 0.10
Nodes (33): Group and bulk requests, Request number generation, assertNoExistingLinkNumbers(), createSingleBulkRequest(), importBulkRequestsFromFile(), normalizeMealPlan(), combineDateAndTime(), getCell() (+25 more)

### Community 4 - "Docker Stack Deployment"
Cohesion: 0.15
Nodes (28): MongoDB ReplicaSet requirement, Backend Service (GraphQL API container), Frontend Service (React SPA), Host Port 4001 → Container 4000 Mapping, KarsAvia Full Docker Stack, MongoDB Service (single node, replica set rs0), karsavia-mongo-data Named Volume, Mongo Replica Set Init Job (+20 more)

### Community 5 - "Email & Push Notifications"
Cohesion: 0.10
Nodes (41): Transactional email delivery, Firebase push notifications, Notification subsystem, buildSupportChatUrl(), buildSupportClientMessageEmail(), esc(), span(), spanNo() (+33 more)

### Community 6 - "Server Entry & Auth Middleware"
Cohesion: 0.08
Nodes (37): Dual entry points (server2.js / server.js), .env is committed with dev values, Environment variable contract (.env), Central typeDef/resolver mergers, isAuthError(), Unified auth middleware, mergedResolvers, app (+29 more)

### Community 7 - "System Updates & Maintenance Banner"
Cohesion: 0.11
Nodes (38): Maintenance banner with live subscription, Semver comparison gating for release visibility, System update notifications (SystemUpdate), siteResolver, hasLegacySections(), main(), getMaintenanceBanner(), updateMaintenanceBanner() (+30 more)

### Community 8 - "Bot Service & Webhooks"
Cohesion: 0.11
Nodes (15): router, chatResolver, BotService, buildSenderName(), buildTelegramUrl(), buildUserData(), deleteTelegramWebhook(), parseTelegramUpdate() (+7 more)

### Community 9 - "FAP Scope & Subscriptions"
Cohesion: 0.10
Nodes (29): viewerHotelIndexes(), viewerIsAirline(), allow(), publishPassengerRequestUpdated(), AIRLINE_ROLES, buildScopeFilter(), canAccessRequest(), denied() (+21 more)

### Community 10 - "Room Occupancy Overlap"
Cohesion: 0.17
Nodes (20): Hotel room counters and recount, Room occupancy overlap rules, addDays(), computeRoomShareMatrix(), listServiceNights(), parseDDMMYYYY_HHMMSS(), startOfServiceDay(), toRu() (+12 more)

### Community 11 - "Price Geography Conflicts"
Cohesion: 0.16
Nodes (26): syncAirlinePriceGeography(), addToOccupiedByContractType(), assertNoAirportConflict(), assertNoCrossPriceLevelConflict(), assertNoDuplicateGeography(), collectOccupiedLevels(), conflictingContractTypes(), contractTypesConflict() (+18 more)

### Community 12 - "Push Notification Delivery"
Cohesion: 0.15
Nodes (23): getSubjectTokenWhere(), sendNotificationToSubject(), sendNotificationToUser(), sendNotificationToUsers(), sendToToken(), sendToTokens(), SUBJECT, dedupeRecipients() (+15 more)

### Community 13 - "Passenger Request Mutations"
Cohesion: 0.13
Nodes (19): assertIndex(), assertMoment(), assertReason(), emptyDriversService(), emptyLivingService(), emptyPeopleService(), finishPassengerRequestMutation(), getSubjectName() (+11 more)

### Community 14 - "Global Resolvers & Logs"
Cohesion: 0.09
Nodes (18): allMiddleware(), Logs as a first-class model with pagination, airportResolver, cityInclude, cityResolver, documentationResolver, externalAuthResolver, globalResolver (+10 more)

### Community 15 - "Cron Jobs & Backups"
Cohesion: 0.09
Nodes (39): Scheduled cron jobs, handleUserInput(), rl, showMenu(), Cron auto-archiving of expired contracts, Request archiving with cron and grace period, User presence and last-visit tracking, createBackup() (+31 more)

### Community 16 - "GraphQL Schema & Resolvers"
Cohesion: 0.08
Nodes (19): Per-domain GraphQL module layout, Composite Prisma types (Information, Price, MealPrice, MealPlan), Driver / representative / organization entities, Global shared schema and resolver layer, HotelChess to Room relation via nested connect, Kars Avia GraphQL Backend, Report engine versioning (v5 to v7), Room categories and tariffs (+11 more)

### Community 17 - "Roster & Saved Passengers"
Cohesion: 0.21
Nodes (20): DRIVER_SERVICES, DRY_RUN, main(), dedupeSavedPassengers(), ensurePersonId(), mergeManifestPeopleIntoRoster(), mergeSavedPerson(), normalizeFullNameKey() (+12 more)

### Community 18 - "Passenger Document Recognition"
Cohesion: 0.14
Nodes (13): EXTRACTION_PROMPT, prepareImage(), collapse(), computeConfidence(), normalizeFields(), EMPTY_RESULT, recognizePassengerDocument(), gptExtractFields() (+5 more)

### Community 19 - "Backend Dependencies"
Cohesion: 0.11
Nodes (19): axios, child_process, cli-progress, dotenv-config, graphql, graphql-ws, @graphql-yoga/redis-event-target, node-cron (+11 more)

### Community 20 - "Request Cost Allocation"
Cohesion: 0.14
Nodes (28): getCategoryPriceFromContract(), buildRequestRowForAllocation(), computeRequestCosts(), countDaysFromIntervals(), getPersonStaySummaries(), mergeIntervals(), toDayStartUtcMs(), toInclusiveEndMs() (+20 more)

### Community 21 - "Protected File Storage Routes"
Cohesion: 0.31
Nodes (10): Backend Persistent Bind Mounts (uploads, reports, reserve_files, logs, backups), BACKUP_DIR, Protected /files/* Route, Storage Roots (uploads, reports, reserve_files), RESERVE_FILES_ROOT, getRootDirectory(), REPORTS_ROOT, RESERVE_FILES_ROOT (+2 more)

### Community 22 - "Role-based Auth Middleware"
Cohesion: 0.15
Nodes (21): Role-based middleware decorators, adminHotelAirMiddleware(), adminMiddleware(), airlineAdminMiddleware(), airlineMiddleware(), airlineModerMiddleware(), authMiddleware(), dispatcherModerMiddleware() (+13 more)

### Community 23 - "Airline Analytics Builders"
Cohesion: 0.16
Nodes (32): buildAirlineAnalyticsPeriod(), buildServiceAirportsFromRequests(), buildServiceAnalyticsBlock(), buildServicePositionsFromRequests(), buildServiceRequestItems(), buildTransferAirports(), buildTransferItems(), buildTransferPositions() (+24 more)

### Community 24 - "Request Pricing Calculation"
Cohesion: 0.18
Nodes (26): calculateMealCostForReportDays(), getAirlineMealPrice(), AIRLINE_PRICES_INCLUDE, buildLivingCostsByRequestId(), buildPriceForRequest(), buildRequestRowForAllocation(), calculateMealParts(), calculateRequestAirlinePrice() (+18 more)

### Community 26 - "Access Menu Permissions"
Cohesion: 0.05
Nodes (73): AccessMenu feature-flag permissions, Department access control (accessMenu), Access/refresh token lifecycle, Two-factor authentication (speakeasy + QR), ACCESS_MENU_KEYS, compactAccessMenu(), hasOwn(), ADMIN_HOTEL_AIR_ROLES (+65 more)

### Community 27 - "Real-time PubSub Subscriptions"
Cohesion: 0.18
Nodes (20): PubSub topic naming, Real-time GraphQL subscriptions, Redis-backed pub/sub for multi-instance, PubSub subscriptions and subscription context, wsServer, canReceiveChatReadSubscription(), canReceiveChatSubscription(), isUserChatParticipant() (+12 more)

### Community 28 - "Baggage Delivery Normalization"
Cohesion: 0.25
Nodes (15): collectBaggageDriverPatch(), countTripPeople(), has(), normalizeBaggageTags(), normalizeDriverPerson(), normalizeDriversForWrite(), normalizePeopleForWrite(), sumPeopleCost() (+7 more)

### Community 29 - "Passenger Request Resolver"
Cohesion: 0.05
Nodes (68): passengerRequestResolver, createRecognitionRateLimiter(), recognitionRateLimiter, getDispatcherFallbackForPassengerEmail(), HOTEL_CHESS_LOG_ACTIONS, KARS_FALLBACK_ACTIONS, resolveEmailActionForLog(), installPubsubSpy() (+60 more)

### Community 30 - "Documentation Tree & Backfill"
Cohesion: 0.09
Nodes (10): prisma, Documentation tree and hierarchy, deleteSectionCascade(), getSectionsHierarchyJSONOptimized(), isObjectId(), main(), parse(), defaultJsonPath (+2 more)

### Community 31 - "Prisma Workflow & Scripts"
Cohesion: 0.18
Nodes (20): generated/client is not hand-editable, npm script catalogue, Schema-first Prisma workflow, scripts, backup, dev, migrateupload, pdp (+12 more)

### Community 32 - "Contract Archiving"
Cohesion: 0.19
Nodes (20): applyArchiveData(), applyRestoreData(), archiveAgreementRecord(), archiveAgreementRecordInternal(), archiveContractRecord(), archiveContractRecordInternal(), buildExpiredNoProlongationWhere(), performArchiveAgreement() (+12 more)

### Community 33 - "Log Action Diffing"
Cohesion: 0.22
Nodes (19): buildCompactPayload(), compactImages(), computeDiff(), createActions, createLog(), deleteActions, getByPath(), isPlainObject() (+11 more)

### Community 34 - "Report Draft & Share Metadata"
Cohesion: 0.17
Nodes (18): buildDraftPresentation(), buildHotelReportData(), normalizeReportDraftRows(), REQUEST_STATUSES, requestIncludeAirline, requestIncludeHotel, buildShareClusterId(), buildShareNoteFromSegments() (+10 more)

### Community 35 - "Backend Tech Stack"
Cohesion: 0.10
Nodes (21): @apollo/server, argon2, Backend tech stack, express, firebase-admin, @graphql-tools/merge, jsonwebtoken, nodemailer (+13 more)

### Community 36 - "Request & Reserve Module"
Cohesion: 0.16
Nodes (14): Duplicate request detection, Meal plan calculation (MealPlan / DailyMeal), Reserve module, requestResolver, transporter, reserveResolver, formatDate(), reverseDateTimeFormatter() (+6 more)

### Community 37 - "Backend Health & Conventions"
Cohesion: 0.21
Nodes (12): House rules for writing code, GET /health liveness endpoint, KarsAvia GraphQL Backend (v3.5.0), Token economy rule, Visual style discipline, Backend /health Healthcheck, Post-deploy verification via /health, version (+4 more)

### Community 38 - "Upload File Migration"
Cohesion: 0.19
Nodes (18): buildOldVariants(), buildTargetDir(), CONTRACT_FILE_MODELS, contractFileContainsVariant(), ensureDir(), getFileDateParts(), getSourceInfo(), isTopLevelFile() (+10 more)

### Community 39 - "Support Chat & Documentation"
Cohesion: 0.22
Nodes (13): Support chat separated from main chats, buildDocumentationTree(), sanitizeTreeInput(), dedupe(), fetchSubtreeByRoot(), getDescendantIds(), assertCanOpenSupportChat(), assertSupportAgent() (+5 more)

### Community 40 - "Price Location Resolution"
Cohesion: 0.25
Nodes (17): applyCityRecord(), buildPriceSearchLocation(), getHotelLocation(), getPriceGeographies(), hasGeoValue(), matchesCityLevel(), matchesCountryLevel(), matchesRegionLevel() (+9 more)

### Community 41 - "Contract Resolver & Filters"
Cohesion: 0.21
Nodes (14): agreementExpirationFields, appendUploadedContractFiles(), contractExpirationFields, contractResolver, appendArchiveFilter(), buildAdditionalAgreementWhere(), isArchivedContractFilter(), buildAirlineContractWhere() (+6 more)

### Community 43 - "Passenger Request Emails"
Cohesion: 0.41
Nodes (14): buildCancelPassengerRequestEmail(), buildCreatePassengerRequestEmail(), buildHotelChessPassengerRequestEmail(), buildPassengerRequestActionEmail(), buildPassengerRequestDatesChangeEmail(), buildPassengerRequestRelayUrl(), buildUpdatePassengerRequestEmail(), esc() (+6 more)

### Community 44 - "Contract Expiration Sorting"
Cohesion: 0.18
Nodes (13): addUtcMonths(), compareContractsByExpiration(), getContractExpirationMeta(), sortContractsByExpiration(), startOfUtcDay(), activeFilter, agreementWhere, archivedFilter (+5 more)

### Community 45 - "Request Email Templates"
Cohesion: 0.35
Nodes (15): buildCancelRequestDoneEmail(), buildCancelRequestRequestEmail(), buildCreateRequestEmail(), buildDateRangeEmail(), buildExtendRequestEmail(), buildHotelChessPlacementEmail(), buildHotelChessTransferEmail(), buildNewMessageEmail() (+7 more)

### Community 46 - "File Upload & Deletion"
Cohesion: 0.28
Nodes (13): buildUploadPath(), deleteFiles(), ensureDir(), resolveAbsoluteFilePath(), safeSlug(), uploadBuffer(), uploadFiles(), canonicalFilePath() (+5 more)

### Community 47 - "Living Resolver & Hotel Chess"
Cohesion: 0.18
Nodes (12): applyServiceRecalc(), assertHotelScopeAccess(), countLivingPeople(), notifyHotelOverbookIfCrossed(), withHotelPeople(), ensureAccommodationChesses(), ensureHotelPerson(), makeRoomCategoryLabel() (+4 more)

### Community 48 - "Report XLSX/PDF Exporter"
Cohesion: 0.22
Nodes (15): Report exporter (XLSX styling, sorting, PDF conversion), writeExcelAndSave(), colLetter(), generateExcelAvia(), generateExcelHotel(), writeStyledWorkbook(), buildPresentationRow(), buildReportPresentation() (+7 more)

### Community 50 - "Driver Resolver & Image Upload"
Cohesion: 0.31
Nodes (7): driverResolver, buildUploadPath(), deleteImage(), ensureDir(), safeSlug(), uploadImage(), dateFormatter()

### Community 52 - "Contract File Management"
Cohesion: 0.33
Nodes (11): Contracts module, deleteContractAndAgreementFiles(), deleteAllContractFilesFromDisk(), deleteContractFileFromDisk(), deriveDisplayNameFromPath(), extractFileUrls(), findContractFileIndex(), normalizeContractFiles() (+3 more)

### Community 53 - "Passenger Groups & Hotel Items"
Cohesion: 0.26
Nodes (9): Passenger Request module, ensurePassengerServiceHotelItemId(), KINDS, LEVELS, removeGroup(), rosterIds(), stripPersonFromGroups(), upsertGroup() (+1 more)

### Community 54 - "Airline Service Comparison"
Cohesion: 0.27
Nodes (12): analyticsAirlineServiceComparison(), assertDate(), buildCrewWhere(), computePeriodMetricsForRegion(), extractRoomsUsedFromRequest(), getRegionToAirportIds(), normalizeRegions(), normalizeServices() (+4 more)

### Community 56 - "Positions & Dispatcher Resolver"
Cohesion: 0.30
Nodes (8): Positions (должности) model consolidation, dispatcherResolver, TRANSFER_NOTIFICATION_ACTIONS, AIRLINE_POSITION_SEPARATORS, assertAirlinePositionForUser(), assertPositionAccess(), isAirlinePosition(), resolveAirlineId()

### Community 57 - "Transfer & Baggage Normalizers"
Cohesion: 0.24
Nodes (15): driversServicePatch(), mapDriverAt(), ensureDriverPerson(), getTransferField(), getTransferServiceKind(), normalizeCrewMember(), normalizeOptionalString(), normalizePassengerServiceDriver() (+7 more)

### Community 58 - "Partial-day Settings Rules"
Cohesion: 0.36
Nodes (10): assertValidHhMm(), ensureGlobalPartialDaySetting(), getDefaultPartialDayRules(), listPartialDaySettings(), parseHhMmToMinutes(), resolvePartialDayRules(), rulesToCalcConfig(), settingToRules() (+2 more)

### Community 59 - "One-off Migration Scripts"
Cohesion: 0.12
Nodes (20): One-off migration scripts, Thin resolvers, fat service layer, @prisma/client, Legacy schema migration script, Upload and backfill migrations, DEFAULT, main(), prisma (+12 more)

### Community 60 - "Transfer Resolver & PubSub"
Cohesion: 0.17
Nodes (6): removeContractFileRecord(), DATE_FIELDS, transferResolver, logAction(), RedisEventTargetPubSub, buildTransferListWhere()

### Community 61 - "Airline & Hotel Resolvers"
Cohesion: 0.12
Nodes (16): Dependency hygiene and resource reduction, Pagination and server payload reduction, airlineResolver, hasOwn(), syncDepartmentPositionLinks(), hotelResolver, transporter, buildAirlineWhere() (+8 more)

### Community 62 - "GraphQL Auth Context"
Cohesion: 0.21
Nodes (12): JWT authentication into GraphQL context, AUTH_ERROR_CODES, AuthError, buildAuthContext(), EMPTY_TOKEN_VALUES, emptyContext(), extractToken(), isLikelyJwt() (+4 more)

### Community 65 - "FAP Access Guards"
Cohesion: 0.44
Nodes (6): ALLOWED_SUBJECT_TYPES, assertFapSubject(), guardResolver(), guardSection(), guardSubscriptions(), withFapAuthGuard()

### Community 66 - "Winston File Logger"
Cohesion: 0.35
Nodes (10): Winston plus monthly-rotation file logger, Host-mounted runtime directories, appendLog(), ensuredDirs, ensureLogDir(), getLogFilePath(), getTimeStamp(), logAuthError() (+2 more)

### Community 71 - "Document Generation Libraries"
Cohesion: 0.22
Nodes (9): File and document generation, exceljs, graphql-upload, exceljs, graphql-upload, pdfkit, sharp, pdfkit (+1 more)

### Community 72 - "Contract File Migration"
Cohesion: 0.33
Nodes (8): DRY_RUN, fetchLegacyDocs(), hasLegacyFiles(), LEGACY_FILES_FILTER, main(), migrateModel(), TARGETS, updateLegacyDoc()

### Community 73 - "Package Config & Nodemon"
Cohesion: 0.11
Nodes (17): Nodemon ignores runtime write directories, dotenv, madge, nodemon, author, description, devDependencies, dotenv (+9 more)

### Community 75 - "FAP Scope Readiness Check"
Cohesion: 0.36
Nodes (7): AIRLINE_ROLES, countDangling(), DISPATCHER_ROLES, HOTEL_ROLES, KNOWN_ROLES, main(), sample()

### Community 76 - "TOTP Two-factor Auth"
Cohesion: 0.29
Nodes (7): TOTP two-factor authentication, @levminer/speakeasy, @levminer/speakeasy, qrcode, speakeasy, qrcode, speakeasy

### Community 82 - "Chess Helpers"
Cohesion: 0.47
Nodes (3): closeOpenChess(), closesBeforeStart(), AT

### Community 83 - "Price Geography Normalization Tests"
Cohesion: 0.33
Nodes (5): airportOnPriceFindMany, cityFindUnique, priceGeoFindMany, regionFindFirst, regionFindUnique

### Community 85 - "Passenger Hotel Address Backfill"
Cohesion: 0.60
Nodes (4): APPLY, composeHotelAddress(), main(), sameString()

### Community 87 - "Airline Price Geography Migration"
Cohesion: 0.80
Nodes (4): fetchLegacyPriceDocs(), hasLegacyGeography(), main(), toObjectIdString()

## Ambiguous Edges - Review These
- `corsOptions.js` → `PubSub subscriptions and subscription context`  [AMBIGUOUS]
  README.md · relation: conceptually_related_to
- `airload.js` → `Legacy schema migration script`  [AMBIGUOUS]
  README.md · relation: conceptually_related_to
- `Published ports 3000 and 4000` → `Host Port 4001 → Container 4000 Mapping`  [AMBIGUOUS]
  INSTALL.md · relation: conceptually_related_to

## Knowledge Gaps
- **175 isolated node(s):** `rl`, `AUTH_ERROR_CODES`, `name`, `main`, `start2` (+170 more)
  These have ≤1 connection - possible missing edges or undocumented components.
- **20 thin communities (<3 nodes) omitted from report** — run `graphify query` to explore isolated nodes.

## Suggested Questions
_Questions this graph is uniquely positioned to answer:_

- **What is the exact relationship between `corsOptions.js` and `PubSub subscriptions and subscription context`?**
  _Edge tagged AMBIGUOUS (relation: conceptually_related_to) - confidence is low._
- **What is the exact relationship between `airload.js` and `Legacy schema migration script`?**
  _Edge tagged AMBIGUOUS (relation: conceptually_related_to) - confidence is low._
- **What is the exact relationship between `Published ports 3000 and 4000` and `Host Port 4001 → Container 4000 Mapping`?**
  _Edge tagged AMBIGUOUS (relation: conceptually_related_to) - confidence is low._
- **Why does `prisma` connect `Documentation Tree & Backfill` to `Data Backfill & Travelline`, `Analytics & Request Aggregation`, `External Auth & File Access`, `Bulk Request Import`, `Docker Stack Deployment`, `Email & Push Notifications`, `Server Entry & Auth Middleware`, `System Updates & Maintenance Banner`, `Bot Service & Webhooks`, `FAP Scope & Subscriptions`, `Room Occupancy Overlap`, `Price Geography Conflicts`, `Push Notification Delivery`, `Passenger Request Mutations`, `Global Resolvers & Logs`, `Cron Jobs & Backups`, `GraphQL Schema & Resolvers`, `Roster & Saved Passengers`, `Request Cost Allocation`, `Role-based Auth Middleware`, `Airline Analytics Builders`, `Request Pricing Calculation`, `Access Menu Permissions`, `Real-time PubSub Subscriptions`, `Passenger Request Resolver`, `Contract Archiving`, `Log Action Diffing`, `Report Draft & Share Metadata`, `Request & Reserve Module`, `Upload File Migration`, `Support Chat & Documentation`, `Price Location Resolution`, `Contract Resolver & Filters`, `Passenger Request Emails`, `Living Resolver & Hotel Chess`, `Driver Resolver & Image Upload`, `Airline Service Comparison`, `Positions & Dispatcher Resolver`, `Partial-day Settings Rules`, `One-off Migration Scripts`, `Transfer Resolver & PubSub`, `Airline & Hotel Resolvers`, `GraphQL Auth Context`, `Contract File Migration`, `FAP Scope Readiness Check`, `Passenger Hotel Address Backfill`, `Airline Price Geography Migration`?**
  _High betweenness centrality (0.276) - this node is a cross-community bridge._
- **Why does `dependencies` connect `Backend Dependencies` to `Backend Tech Stack`, `Rate Limiting Library`, `GraphQL Subscriptions Library`, `Archetype Library`, `One-off Migration Scripts`, `Redis Client Library`, `Mpath Library`, `CORS Library`, `Stream Promise Library`, `UUID Library`, `File Saver Library`, `Document Generation Libraries`, `Package Config & Nodemon`, `GraphQL Tools Schema`, `TOTP Two-factor Auth`, `Max Bot API`, `Express Session`, `Fast Glob`, `GraphQL Passport`, `Punycode`, `Winston Logger`, `Winston MongoDB`?**
  _High betweenness centrality (0.062) - this node is a cross-community bridge._
- **Why does `TravellineService` connect `Data Backfill & Travelline` to `Request & Reserve Module`, `Global Resolvers & Logs`?**
  _High betweenness centrality (0.059) - this node is a cross-community bridge._
- **Are the 4 inferred relationships involving `prisma` (e.g. with `MongoDB ReplicaSet requirement` and `MongoDB Service (single node, replica set rs0)`) actually correct?**
  _`prisma` has 4 INFERRED edges - model-reasoned connections that need verification._