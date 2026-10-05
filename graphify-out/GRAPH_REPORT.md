# Graph Report - .  (2026-10-05)

## Corpus Check
- 393 files · ~259,459 words
- Verdict: corpus is large enough that graph structure adds value.

## Summary
- 2194 nodes · 6126 edges · 104 communities (100 shown, 4 thin omitted)
- Extraction: 95% EXTRACTED · 5% INFERRED · 0% AMBIGUOUS · INFERRED: 285 edges (avg confidence: 0.83)
- Token cost: 0 input · 0 output

## Community Hubs (Navigation)
- GraphQL typeDefs: typedefs.js & per-domain schema modules
- FAP Passenger Analytics & Grouping
- Server Entry: server.js, server2.js, jobs & shutdown
- Contract Archiving Cron: contractArchiving & archiveExpiredAgreements
- Contract Resolver & Filters
- Access Menu Keys & Effective Access
- Package Config & Nodemon
- Support Chat & Documentation Tree: supportAgent
- Room Occupancy Overlap
- Notifications: notificationMenuCheck, email delivery & Firebase transfer push
- External Auth: Magic Links & Hotel Preview
- File Access Control: checkFileAccess & path normalization
- Request Grouping: groupRequestsByAirlineAirportMonth
- Backend Docs: CLAUDE.md overview & /health healthcheck
- Hotel Resolver: hotel.resolver, uploadImage, roomUtils & hotelFilters
- One-off Migrations: backfill.js, airload.js & supportTicketsMigration
- Winston File Logger
- System Updates & Maintenance Banner
- Reserve & Meal: reserve.resolver, calculateMeal, mutationError & generateReservePas
- Secret Fields Hiding & Airline/Organization Resolvers: hiddenSecretFields, transferPriceContract
- FAP Report Stage: hotelReportStage & reportStageList
- Positions & Dispatcher Access: positionAccess, dispatcher.resolver
- PubSub & Subscriptions: pubsub.js, subscriptionAuth, representative.resolver
- Bulk Request Import & Numbering: createBulkRequests, generateRequestNumber
- Auth: user.resolver, sign-in, refresh tokens
- Auth Emails: authEmailTemplates, sendAuthEmails & appConfig
- User Presence & Cron Jobs: userPresence, cronTasks, reportArchive & reportDecade
- File Access Routes & Backup
- Backend tech stack: @apollo/server, express, jsonwebtoken, argon2, pm2
- Prisma Workflow & Scripts
- Transfer Push: transferPushService & transfer.resolver
- GraphQL Auth Context
- TOTP Two-Factor Auth: speakeasy & qrcode
- Docker Stack Deployment
- Email Notifications: notificationMenuCheck, sendRequestPartyEmail & departmentEmailDelivery
- Auth Middleware: role decorators (authMiddleware.js)
- Bot Service & Webhooks
- Telegram API & Webhooks: telegramApi, botWebhooks
- Backup CLI: backup.js & cli.js
- Driver Access: driverAccess, driver.resolver & global.resolver
- package.json: dependencies (graphql-tools, yoga redis, axios, cors)
- Prisma client, documentation.resolver & backfill scripts
- Price Geography: normalizeGeography & contract-type occupancy
- Resolvers index: resolvers.js, city, airport, log
- analytics
- Passenger Request Files: uploadFiles, deleteFiles
- Airline prices hidden from hotel: hideAirlinePrices, roomKindSeason.resolver, mutationError
- Baggage Delivery Normalization
- FAP Scope & Subscriptions
- FAP Edit Guard & Request Envelope
- FAP Tests: supplyMutation & characterization coverage
- Merge Saved People (duplicates)
- Transfer & Baggage Normalizers
- Roster & Saved Passengers
- Report Drafts: merge, frozen rows, changedFrom
- Access: assertCanManageAccess.js guards & Travelline role checks
- Backfill: backfill-saved-report-titles (saved report titles)
- Request Archive Guard: requestArchiveGuard (assertRequestNotArchived)
- Price Resolution by Hotel Location (resolvePriceByHotelLocation)
- Airline Analytics: airlineAnalytics & airlineAnalyticsUtils (period, budget, service blocks)
- Report Utils: reportUtils, request stay dates & living price
- Airline Analytics: airlineServiceComparison (position & region metrics)
- Person Stay Summary: personStaySummary (getPersonStaySummaries)
- User Login Normalization & Legacy Migration: normalizeUserLogin, migration.js
- Contract Archive & Expiration: contractArchive, contractExpiration & unit tests
- Passenger Document Recognition
- Document Recognition: recognitionRateLimit
- Report Draft Emails: reportDraftEmailTemplates & notifyReportDecision
- Request Emails: requestEmailTemplates & frontendEntityLinks
- Passenger Request Emails: passengerRequestEmailTemplates & buildPassengerRequestEmail
- Support Emails & Rate Guard: supportEmailTemplates, notificationRateGuard & notifyReportSubmit
- Room Kind Season Prices: roomKindSeasonPrice & resolver
- Action Log: logaction.js sanitization & diff
- Migration: approvePricingForSubmittedReports
- Backfill: backfillExternalUserScopeFields
- Backfill: backfillPassengerHotelAddressCity
- Backfill: backfillRequestReserveAirlineDepartment
- FAP Scope Readiness Probe: checkFapScopeReadiness
- Maintenance: healPassengerHotelChessIndexes
- Migration: migrateAirlinePriceGeographyToArray
- Migration: migrateCityRegionsToRegionModel
- Contract File Management
- Upload File Migration
- Sync: syncAirportsFromJson
- FAP: passengerRequestEmailActions & baggage characterization tests
- Hotel Chess Helpers: chessHelpers (closeOpenChess)
- Driver Vehicle Catalog: driverVehicle (catalogVehicleNumber)
- FAP Access Guards
- Hotel Report Rows: hotelReportRows (maskReportRowPrices)
- FAP Request Envelope: envelope.js & service resolvers
- Request Pricing: requestPricing.js (overlapping recalculation)
- Legacy Reports: reports.js (meal, living cost, dispatcher fee)
- Bulk Request XLSX Parser: parseBulkRequestXlsx
- Room Share Matrix (report nights)
- Travelline: travellineService, mappers, booking & autoSyncSchedule
- Price Search Location Tests
- FAP Tests: fapHarness, pubsub spy, transfer characterization & reject-draft
- Price Geography Normalization Tests
- FAP Tests: report characterization (report.characterization.test)
- FAP Tests: prismaDouble & hotelReportVisibility
- FAP Tests: living, roster & early characterization, runFapMutation
- FAP Tests: fixtureShape (fixtures vs schema)
- FAP Tests: list filters, query & moveDateValidation
- report

## God Nodes (most connected - your core abstractions)
1. `prisma` - 122 edges
2. `installPrismaDouble()` - 60 edges
3. `TravellineService` - 50 edges
4. `logger` - 33 edges
5. `pubsub` - 33 edges
6. `installPubsubSpy()` - 30 edges
7. `makeRequest()` - 30 edges
8. `allMiddleware()` - 29 edges
9. `BotService` - 25 edges
10. `resolveScope()` - 25 edges

## Surprising Connections (you probably didn't know these)
- `Meal plan calculation (MealPlan / DailyMeal)` --shares_data_with--> `calculateMealCost()`  [INFERRED]
  README.md → services/report/reports.js
- `Environment variable contract (.env)` --references--> `serviceAccountPath`  [INFERRED]
  CLAUDE.md → src/lib/firebaseAdmin.js
- `Real-time GraphQL subscriptions` --references--> `wsServer`  [INFERRED]
  CLAUDE.md → server2.js
- `Redis-backed pub/sub for multi-instance` --references--> `@graphql-yoga/redis-event-target`  [INFERRED]
  CLAUDE.md → package.json
- `Redis-backed pub/sub for multi-instance` --references--> `ioredis`  [INFERRED]
  CLAUDE.md → package.json

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

## Communities (104 total, 4 thin omitted)

### Community 12 - "GraphQL typeDefs: typedefs.js & per-domain schema modules"
Cohesion: 0.08
Nodes (10): Kars Avia GraphQL Backend, Composite Prisma types (Information, Price, MealPrice, MealPlan), Driver / representative / organization entities, Global shared schema and resolver layer, HotelChess to Room relation via nested connect, Report engine versioning (v5 to v7), Report exporter (XLSX styling, sorting, PDF conversion), Room categories and tariffs (+2 more)

### Community 4 - "FAP Passenger Analytics & Grouping"
Cohesion: 0.06
Nodes (58): Analytics module, buildWhereConditionsRequests(), analyticsUserRequests(), createdByPeriodForEntityRequests(), totalCreatedRequests(), totalCancelledRequests(), countRequestsByStatus(), getRequestProcessingTime() (+50 more)

### Community 9 - "Server Entry: server.js, server2.js, jobs & shutdown"
Cohesion: 0.09
Nodes (35): Unified auth middleware, Dual entry points (server2.js / server.js), Central typeDef/resolver mergers, isAuthError(), mergedResolvers, require, sslOptions, httpServer (+27 more)

### Community 56 - "Contract Archiving Cron: contractArchiving & archiveExpiredAgreements"
Cohesion: 0.23
Nodes (13): Cron auto-archiving of expired contracts, Request archiving with cron and grace period, Scheduled cron jobs, buildExpiredNoProlongationWhere(), archiveAgreementRecordInternal(), publishContractUpdate(), archiveExpiredContracts(), getAgreementParentTopic() (+5 more)

### Community 51 - "Contract Resolver & Filters"
Cohesion: 0.21
Nodes (14): Contracts module, contractExpirationFields, agreementExpirationFields, deleteContractAndAgreementFiles(), removeContractFileRecord(), isArchivedContractFilter(), appendArchiveFilter(), buildAdditionalAgreementWhere() (+6 more)

### Community 64 - "Access Menu Keys & Effective Access"
Cohesion: 0.30
Nodes (9): Department access control (accessMenu), AccessMenu feature-flag permissions, ACCESS_MENU_KEYS, hasOwn(), compactAccessMenu(), hasOwn(), mergeAccessMenus(), resolveEffectiveAccessMenu() (+1 more)

### Community 57 - "Package Config & Nodemon"
Cohesion: 0.12
Nodes (15): Dependency hygiene and resource reduction, name, main, type, keywords, author, license, description (+7 more)

### Community 44 - "Support Chat & Documentation Tree: supportAgent"
Cohesion: 0.19
Nodes (15): Documentation tree and hierarchy, Support chat separated from main chats, supportResolver, buildDocumentationTree(), sanitizeTreeInput(), dedupe(), fetchSubtreeByRoot(), getDescendantIds() (+7 more)

### Community 47 - "Room Occupancy Overlap"
Cohesion: 0.22
Nodes (15): Duplicate request detection, Hotel room counters and recount, Room occupancy overlap rules, formatOverlapPeriod(), formatOverlapErrorMessage(), overlapInclude, findHotelChessOverlap(), ensureNoOverlap() (+7 more)

### Community 3 - "Notifications: notificationMenuCheck, email delivery & Firebase transfer push"
Cohesion: 0.07
Nodes (55): Transactional email delivery, Firebase push notifications, Notification subsystem, SUBJECT, getSubjectTokenWhere(), sendToToken(), sendToTokens(), sendNotificationToUser() (+47 more)

### Community 2 - "External Auth: Magic Links & Hotel Preview"
Cohesion: 0.06
Nodes (54): External auth via magic link, SUBJECT_TYPE, EXTERNAL_SCOPES, EXTERNAL_ACCESS_TYPES, canReuseSessionForUsedLink(), throwForbidden(), resolveAdminId(), issueTokenForExternalUser() (+46 more)

### Community 40 - "File Access Control: checkFileAccess & path normalization"
Cohesion: 0.14
Nodes (20): File access control and path normalization, File Access Rules by Role, File and document generation, JWT-protected /files/* route, Nodemon ignores runtime write directories, Host-mounted runtime directories, exceljs, exceljs (+12 more)

### Community 62 - "Request Grouping: groupRequestsByAirlineAirportMonth"
Cohesion: 0.23
Nodes (12): Group and bulk requests, buildRequestListWhere(), REQUEST_LIST_INCLUDE, monthFormatter, getArrivalYearMonth(), formatMonthEn(), buildGroupKey(), buildMonthLabel() (+4 more)

### Community 68 - "Backend Docs: CLAUDE.md overview & /health healthcheck"
Cohesion: 0.21
Nodes (12): GET /health with app version, House rules for writing code, Visual style discipline, Token economy rule, KarsAvia GraphQL Backend (v3.5.0), GET /health liveness endpoint, Post-deploy verification via /health, Backend /health Healthcheck (+4 more)

### Community 41 - "Hotel Resolver: hotel.resolver, uploadImage, roomUtils & hotelFilters"
Cohesion: 0.15
Nodes (15): Hotel preview links, hotelPreviewMiddleware(), transporter, hotelResolver, safeSlug(), ensureDir(), buildUploadPath(), uploadImage() (+7 more)

### Community 81 - "One-off Migrations: backfill.js, airload.js & supportTicketsMigration"
Cohesion: 0.29
Nodes (7): Legacy schema migration script, Upload and backfill migrations, Thin resolvers, fat service layer, One-off migration scripts, prisma, DEFAULT, main()

### Community 69 - "Winston File Logger"
Cohesion: 0.33
Nodes (10): Logs as a first-class model with pagination, Winston plus monthly-rotation file logger, ensuredDirs, getTimeStamp(), getLogFilePath(), ensureLogDir(), appendLog(), logToFile() (+2 more)

### Community 8 - "System Updates & Maintenance Banner"
Cohesion: 0.12
Nodes (37): Maintenance banner with live subscription, Semver comparison gating for release visibility, System update notifications (SystemUpdate), hasLegacySections(), main(), getMaintenanceBanner(), updateMaintenanceBanner(), computeIsVisible() (+29 more)

### Community 76 - "Reserve & Meal: reserve.resolver, calculateMeal, mutationError & generateReservePas"
Cohesion: 0.36
Nodes (6): Meal plan calculation (MealPlan / DailyMeal), Reserve module, reserveResolver, calculateMeal(), updateDailyMeals(), generateReserveExcel()

### Community 27 - "Secret Fields Hiding & Airline/Organization Resolvers: hiddenSecretFields, transferPriceContract"
Cohesion: 0.15
Nodes (16): Pagination and server payload reduction, priceValidity(), isWindowedPrice(), hasOwn(), syncDepartmentPositionLinks(), airlineResolver, organizationResolver, buildAirlineWhere() (+8 more)

### Community 33 - "FAP Report Stage: hotelReportStage & reportStageList"
Cohesion: 0.16
Nodes (17): Passenger Request module, publishPassengerRequestUpdated(), hotelIndexesForScope(), ensurePassengerServiceHotelItemId(), PASSENGER_REPORT_STAGES, passengerReportStageIndex(), stageDates(), hotelReportStage() (+9 more)

### Community 73 - "Positions & Dispatcher Access: positionAccess, dispatcher.resolver"
Cohesion: 0.35
Nodes (8): Positions (должности) model consolidation, dispatcherOrSuperAdminMiddleware(), TRANSFER_NOTIFICATION_ACTIONS, AIRLINE_POSITION_SEPARATORS, isAirlinePosition(), resolveAirlineId(), assertAirlinePositionForUser(), assertPositionAccess()

### Community 19 - "PubSub & Subscriptions: pubsub.js, subscriptionAuth, representative.resolver"
Cohesion: 0.15
Nodes (20): PubSub subscriptions and subscription context, Real-time GraphQL subscriptions, PubSub topic naming, Redis-backed pub/sub for multi-instance, Real-time Fan-out Stage: pubsub.publish(MESSAGE_SENT), Admin UI Subscription Stage, wsServer, isUserChatParticipant() (+12 more)

### Community 38 - "Bulk Request Import & Numbering: createBulkRequests, generateRequestNumber"
Cohesion: 0.19
Nodes (16): Request number generation, transporter, reverseDateTimeFormatter(), formatDate(), logAction(), resolveCreatorDepartmentFromSender(), assertNoExistingLinkNumbers(), normalizeMealPlan() (+8 more)

### Community 20 - "Auth: user.resolver, sign-in, refresh tokens"
Cohesion: 0.18
Nodes (19): Access/refresh token lifecycle, buildUserAuthPayload(), registerSelfUser(), verifyEmailWithToken(), requestPasswordResetByEmail(), resetPasswordWithToken(), USER_TYPE, ROLE (+11 more)

### Community 52 - "Auth Emails: authEmailTemplates, sendAuthEmails & appConfig"
Cohesion: 0.35
Nodes (14): Two-factor authentication (speakeasy + QR), getFrontendUrl(), getSupportEmail(), getServiceName(), esc(), buildRegistrationVerifyEmail(), buildPasswordResetEmail(), buildPasswordChangedEmail() (+6 more)

### Community 5 - "User Presence & Cron Jobs: userPresence, cronTasks, reportArchive & reportDecade"
Cohesion: 0.08
Nodes (47): User presence and last-visit tracking, buildSavedReportListWhere(), moveExpiredToArchiving(), finalizeArchivingRequests(), archiveOldSavedReports(), checkAndArchiveRequests(), startArchivingJob(), runPresenceCleanup() (+39 more)

### Community 37 - "File Access Routes & Backup"
Cohesion: 0.16
Nodes (19): Secure File Access System, Automatic File Path Normalization (/uploads → /files/uploads), File Path Field Resolvers (Request.files, Hotel.images, ReportFile.url, …), JWT Bearer Authorization for File Downloads, Dual Path Format Backward Compatibility, Protected /files/* Route, Storage Roots (uploads, reports, reserve_files), Backend Persistent Bind Mounts (uploads, reports, reserve_files, logs, backups) (+11 more)

### Community 39 - "Backend tech stack: @apollo/server, express, jsonwebtoken, argon2, pm2"
Cohesion: 0.10
Nodes (21): Backend tech stack, @apollo/server, @apollo/server, @graphql-tools/merge, @graphql-tools/merge, argon2, argon2, express (+13 more)

### Community 49 - "Prisma Workflow & Scripts"
Cohesion: 0.21
Nodes (18): npm script catalogue, Schema-first Prisma workflow, scripts, backup, start, start2, production, dev (+10 more)

### Community 85 - "Transfer Push: transferPushService & transfer.resolver"
Cohesion: 0.33
Nodes (6): Environment variable contract (.env), .env is committed with dev values, .env.docker and .env.example configuration, wsKeepAliveParsed, wsKeepAliveParsed, getCorsOptions()

### Community 55 - "GraphQL Auth Context"
Cohesion: 0.21
Nodes (12): JWT authentication into GraphQL context, EMPTY_TOKEN_VALUES, AUTH_ERROR_CODES, AuthError, extractToken(), isLikelyJwt(), raiseAuthError(), buildAuthContext() (+4 more)

### Community 86 - "TOTP Two-Factor Auth: speakeasy & qrcode"
Cohesion: 0.29
Nodes (7): TOTP two-factor authentication, @levminer/speakeasy, @levminer/speakeasy, qrcode, qrcode, speakeasy, speakeasy

### Community 18 - "Docker Stack Deployment"
Cohesion: 0.15
Nodes (27): MongoDB ReplicaSet requirement, KarsAvia deployment guide (v3.5.0), Host system requirements, Backend and frontend must be sibling directories, docker compose up --build first-run sequence, Empty database on first deployment, Test SUPERADMIN login credentials (admin/admin123), Docker Compose three-container stack (+19 more)

### Community 72 - "Email Notifications: notificationMenuCheck, sendRequestPartyEmail & departmentEmailDelivery"
Cohesion: 0.24
Nodes (10): generated/client is not hand-editable, @prisma/client, @prisma/client, prisma, ACTION_FIELDS, MENU_OWNERS, isBoolean(), buildNotificationMenuBackfill() (+2 more)

### Community 50 - "Auth Middleware: role decorators (authMiddleware.js)"
Cohesion: 0.24
Nodes (16): Role-based middleware decorators, roleMiddleware(), dispatcherModerMiddleware(), superAdminMiddleware(), adminMiddleware(), adminHotelAirMiddleware(), representativeMiddleware(), moderatorMiddleware() (+8 more)

### Community 25 - "Bot Service & Webhooks"
Cohesion: 0.15
Nodes (7): Telegram Support Message Data Flow, Incoming Stage: Telegram Bot → Webhook/Polling → handleIncomingMessage, Message Persistence Stage (Message record in DB), Admin Reply Stage (sendMessage mutation), Outbound Delivery Stage (bot.sendMessage back to Telegram), chatResolver, BotService

### Community 71 - "Telegram API & Webhooks: telegramApi, botWebhooks"
Cohesion: 0.35
Nodes (8): router, buildSenderName(), buildTelegramUrl(), buildUserData(), parseTelegramUpdate(), sendTelegramMessage(), setTelegramWebhook(), deleteTelegramWebhook()

### Community 75 - "Backup CLI: backup.js & cli.js"
Cohesion: 0.36
Nodes (8): rl, showMenu(), handleUserInput(), __filename, __dirname, createBackup(), restoreBackup(), listBackups()

### Community 14 - "Driver Access: driverAccess, driver.resolver & global.resolver"
Cohesion: 0.14
Nodes (23): allMiddleware(), driverResolver, SUBJECT, resolveAuthSubject(), globalResolver, DRIVER_MANAGER_ROLES, DRIVER_DIRECTORY_ROLES, DRIVER_SERVICE_FIELDS (+15 more)

### Community 6 - "package.json: dependencies (graphql-tools, yoga redis, axios, cors)"
Cohesion: 0.04
Nodes (55): dependencies, @graphql-tools/schema, @graphql-tools/schema, @graphql-yoga/redis-event-target, @graphql-yoga/redis-event-target, @maxhub/max-bot-api, @maxhub/max-bot-api, archetype (+47 more)

### Community 32 - "Prisma client, documentation.resolver & backfill scripts"
Cohesion: 0.15
Nodes (4): prisma, deleteSectionCascade(), getSectionsHierarchyJSONOptimized(), DISPATCHER

### Community 24 - "Price Geography: normalizeGeography & contract-type occupancy"
Cohesion: 0.16
Nodes (26): syncAirlinePriceGeography(), emptyGeo, emptyHotelLocation, normalizeContractType(), conflictingContractTypes(), contractTypesConflict(), throwInvalid(), loadCityById() (+18 more)

### Community 15 - "Resolvers index: resolvers.js, city, airport, log"
Cohesion: 0.08
Nodes (18): airportResolver, cityInclude, cityResolver, contractResolver, dispatcherResolver, documentationResolver, roomKindSeasonResolver, logResolver (+10 more)

### Community 77 - "analytics"
Cohesion: 0.22
Nodes (4): analyticsResolver, INPUT, REQUEST, runAnalytics()

### Community 17 - "Passenger Request Files: uploadFiles, deleteFiles"
Cohesion: 0.17
Nodes (24): appendUploadedContractFiles(), deriveDisplayNameFromPath(), normalizeContractFiles(), extractFileUrls(), validateContractFileUploadInput(), uploadContractFiles(), deleteContractFileFromDisk(), findContractFileIndex() (+16 more)

### Community 53 - "Airline prices hidden from hotel: hideAirlinePrices, roomKindSeason.resolver, mutationError"
Cohesion: 0.22
Nodes (11): AIRLINE_PRICE_KEYS, NESTED_LISTS, shouldHideAirlinePrices(), omitAirlineKeys(), omitAirlinePriceWrites(), hiddenAirlinePrice(), hiddenAirlineFlag(), isPrismaError() (+3 more)

### Community 21 - "Baggage Delivery Normalization"
Cohesion: 0.20
Nodes (21): normalizeBaggageTags(), has(), normalizeDriverPerson(), normalizePeopleForWrite(), normalizeDriversForWrite(), sumPeopleCost(), tripReportCost(), countTripPeople() (+13 more)

### Community 10 - "FAP Scope & Subscriptions"
Cohesion: 0.10
Nodes (30): stripInternalDriverFields(), viewerIsAirline(), viewerIsDispatcher(), internalOnly(), dispatcherOnly(), viewerHotelIndexes(), assertAirlineSubject(), allow() (+22 more)

### Community 7 - "FAP Edit Guard & Request Envelope"
Cohesion: 0.11
Nodes (26): normalizeBulkIndexes(), spliceAtIndexes(), getSubjectName(), loadRequestOrThrow(), assertIndex(), assertMoment(), assertReason(), reportWhere() (+18 more)

### Community 63 - "FAP Tests: supplyMutation & characterization coverage"
Cohesion: 0.18
Nodes (6): passengerRequestResolver, here, runRaw(), person(), requestWithFourWaterPeople(), runSupply()

### Community 34 - "Merge Saved People (duplicates)"
Cohesion: 0.19
Nodes (18): DRIVER_FIELDS, normalizeOptionalString(), badInput(), remapId(), rebindPeopleList(), rebindDriverService(), remapGroupMemberIds(), fillKeepFromDrops() (+10 more)

### Community 13 - "Transfer & Baggage Normalizers"
Cohesion: 0.13
Nodes (22): mapDriverAt(), driversServicePatch(), countLivingPeople(), withHotelPeople(), applyServiceRecalc(), notifyHotelOverbookIfCrossed(), normalizeOptionalString(), ensureAccommodationChesses() (+14 more)

### Community 16 - "Roster & Saved Passengers"
Cohesion: 0.19
Nodes (21): SUPPLY_FIELD_LABELS, DRY_RUN, DRIVER_SERVICES, main(), normalizeOptionalString(), normalizePersonType(), normalizePersonCategory(), normalizeFullNameKey() (+13 more)

### Community 0 - "Report Drafts: merge, frozen rows, changedFrom"
Cohesion: 0.05
Nodes (73): buildDraftPresentation(), draftInclude, writeExcelAndSave(), REQUEST_STATUSES, requestIncludeAirline, requestIncludeHotel, buildAirlineReportData(), buildHotelReportData() (+65 more)

### Community 28 - "Access: assertCanManageAccess.js guards & Travelline role checks"
Cohesion: 0.18
Nodes (21): requireTravellineSection(), ADMIN_HOTEL_AIR_ROLES, hasOwn(), forbidden(), unauthenticated(), getActor(), isSuperAdminRole(), isAdminHotelAirRole() (+13 more)

### Community 99 - "Backfill: backfill-saved-report-titles (saved report titles)"
Cohesion: 0.67
Nodes (3): DRY, cellText(), main()

### Community 58 - "Request Archive Guard: requestArchiveGuard (assertRequestNotArchived)"
Cohesion: 0.23
Nodes (10): loadEffectiveAccessMenuForUser(), passengerAnalyticsVerdict(), assertPassengerAnalyticsAllowed(), forbidden(), normalizeStatus(), isRequestArchived(), requestArchiveVerdict(), assertRequestNotArchived() (+2 more)

### Community 42 - "Price Resolution by Hotel Location (resolvePriceByHotelLocation)"
Cohesion: 0.21
Nodes (19): normalizeGeoValue(), hasGeoValue(), getHotelLocation(), applyCityRecord(), buildPriceSearchLocation(), getPriceGeographies(), sortByCreatedAtAsc(), pickFirst() (+11 more)

### Community 29 - "Airline Analytics: airlineAnalytics & airlineAnalyticsUtils (period, budget, service blocks)"
Cohesion: 0.20
Nodes (24): roundMoney(), normalizeServices(), fetchRequests(), fetchTransfers(), getRequestBudget(), getServiceRequestBudget(), buildServiceRequestItems(), buildServiceAirportsFromRequests() (+16 more)

### Community 11 - "Report Utils: reportUtils, request stay dates & living price"
Cohesion: 0.15
Nodes (32): ACTIVE_STATUSES, roundMoney(), createAllocationKey(), getVehicleType(), computeTransferSpend(), computeTransferBudgetDetails(), computeRequestCosts(), buildRequestRowForAllocation() (+24 more)

### Community 66 - "Airline Analytics: airlineServiceComparison (position & region metrics)"
Cohesion: 0.29
Nodes (11): assertDate(), validateRange(), normalizeServices(), normalizeRegions(), buildCrewWhere(), pct(), roundMoney(), getRegionToAirportIds() (+3 more)

### Community 89 - "Person Stay Summary: personStaySummary (getPersonStaySummaries)"
Cohesion: 0.67
Nodes (5): toDayStartUtcMs(), toInclusiveEndMs(), mergeIntervals(), countDaysFromIntervals(), getPersonStaySummaries()

### Community 70 - "User Login Normalization & Legacy Migration: normalizeUserLogin, migration.js"
Cohesion: 0.29
Nodes (9): normalizeUserLogin(), prismaOld, prismaNew, migrateUsers(), migrateHotels(), migrateRooms(), migrateAirlines(), runMigration() (+1 more)

### Community 22 - "Contract Archive & Expiration: contractArchive, contractExpiration & unit tests"
Cohesion: 0.13
Nodes (24): applyArchiveData(), applyRestoreData(), performArchiveContract(), performArchiveAgreement(), archiveContractRecordInternal(), restoreContractRecordInternal(), archiveContractRecord(), restoreContractRecord() (+16 more)

### Community 23 - "Passenger Document Recognition"
Cohesion: 0.14
Nodes (13): EXTRACTION_PROMPT, prepareImage(), collapse(), normalizeFields(), computeConfidence(), EMPTY_RESULT, recognizePassengerDocument(), parseGptJson() (+5 more)

### Community 87 - "Document Recognition: recognitionRateLimit"
Cohesion: 0.38
Nodes (4): createRecognitionRateLimiter(), recognitionRateLimiter, runRaw(), makeEarlyCompletedWater()

### Community 35 - "Report Draft Emails: reportDraftEmailTemplates & notifyReportDecision"
Cohesion: 0.19
Nodes (16): escapeHtml(), buildSavedReportUrl(), buildReportDraftUrl(), span(), fmtDate(), formatReportPeriod(), reportLinkHtml(), airlineCommentHtml() (+8 more)

### Community 36 - "Request Emails: requestEmailTemplates & frontendEntityLinks"
Cohesion: 0.24
Nodes (19): withChatId(), buildRequestCardUrl(), buildPassengerRequestCardUrl(), buildEntityChatUrl(), esc(), span(), spanNo(), requestRelayLinkHtml() (+11 more)

### Community 43 - "Passenger Request Emails: passengerRequestEmailTemplates & buildPassengerRequestEmail"
Cohesion: 0.41
Nodes (18): esc(), span(), spanNo(), formatPassengerRequestLabel(), passengerRequestRelayLinkHtml(), buildCreatePassengerRequestEmail(), buildPassengerRequestDatesChangeEmail(), buildUpdatePassengerRequestEmail() (+10 more)

### Community 30 - "Support Emails & Rate Guard: supportEmailTemplates, notificationRateGuard & notifyReportSubmit"
Cohesion: 0.18
Nodes (16): esc(), span(), spanNo(), buildSupportChatUrl(), supportChatLinkHtml(), buildSupportClientMessageEmail(), emailSentAt, normalizePart() (+8 more)

### Community 65 - "Room Kind Season Prices: roomKindSeasonPrice & resolver"
Cohesion: 0.42
Nodes (12): toDayUtc(), addDaysUtc(), listStayNights(), seasonsOverlap(), assertValidSeasonRange(), assertNoSeasonOverlap(), findSeasonForNight(), resolvePriceForNight() (+4 more)

### Community 45 - "Action Log: logaction.js sanitization & diff"
Cohesion: 0.22
Nodes (19): LARGE_ARRAY_KEYS, isPlainObject(), shouldCompactArrayByKey(), truncateString(), sanitizeLargeFields(), getByPath(), setByPath(), pick() (+11 more)

### Community 59 - "Migration: approvePricingForSubmittedReports"
Cohesion: 0.18
Nodes (14): DRY_RUN, WHERE, FIELDS, selectReportsToApprove(), approvalDataFor(), moment(), run(), main() (+6 more)

### Community 100 - "Backfill: backfillExternalUserScopeFields"
Cohesion: 0.83
Nodes (3): isObjectId(), parse(), main()

### Community 95 - "Backfill: backfillPassengerHotelAddressCity"
Cohesion: 0.60
Nodes (4): APPLY, composeHotelAddress(), sameString(), main()

### Community 96 - "Backfill: backfillRequestReserveAirlineDepartment"
Cohesion: 0.80
Nodes (4): resolveDepartmentFromRecord(), backfillRequests(), backfillReserves(), main()

### Community 82 - "FAP Scope Readiness Probe: checkFapScopeReadiness"
Cohesion: 0.36
Nodes (7): DISPATCHER_ROLES, AIRLINE_ROLES, HOTEL_ROLES, KNOWN_ROLES, sample(), countDangling(), main()

### Community 90 - "Maintenance: healPassengerHotelChessIndexes"
Cohesion: 0.53
Nodes (5): APPLY, isOpen(), findLastOpenIndex(), requestLabel(), main()

### Community 97 - "Migration: migrateAirlinePriceGeographyToArray"
Cohesion: 0.80
Nodes (4): toObjectIdString(), hasLegacyGeography(), fetchLegacyPriceDocs(), main()

### Community 91 - "Migration: migrateCityRegionsToRegionModel"
Cohesion: 0.60
Nodes (5): toObjectIdString(), normalizeRegionName(), fetchCityDocs(), ensureRegionByName(), main()

### Community 78 - "Contract File Management"
Cohesion: 0.33
Nodes (8): DRY_RUN, TARGETS, LEGACY_FILES_FILTER, hasLegacyFiles(), fetchLegacyDocs(), updateLegacyDoc(), migrateModel(), main()

### Community 48 - "Upload File Migration"
Cohesion: 0.19
Nodes (18): UPLOADS_ROOT, REPORTS_ROOT, REPORT_ROOT, ensureDir(), isTopLevelFile(), getFileDateParts(), buildTargetDir(), normalizeUploadPath() (+10 more)

### Community 60 - "FAP: passengerRequestEmailActions & baggage characterization tests"
Cohesion: 0.18
Nodes (10): HOTEL_CHESS_LOG_ACTIONS, KARS_FALLBACK_ACTIONS, resolveEmailActionForLog(), getDispatcherFallbackForPassengerEmail(), runRaw(), withBaggage(), runRaw(), makePerson() (+2 more)

### Community 92 - "Hotel Chess Helpers: chessHelpers (closeOpenChess)"
Cohesion: 0.47
Nodes (3): closesBeforeStart(), closeOpenChess(), AT

### Community 83 - "Driver Vehicle Catalog: driverVehicle (catalogVehicleNumber)"
Cohesion: 0.36
Nodes (5): cache, defaultDeps, keyOf(), catalogVehicleNumber(), resetCatalogVehicleCache()

### Community 79 - "FAP Access Guards"
Cohesion: 0.44
Nodes (6): ALLOWED_SUBJECT_TYPES, assertFapSubject(), guardResolver(), guardSection(), guardSubscriptions(), withFapAuthGuard()

### Community 93 - "Hotel Report Rows: hotelReportRows (maskReportRowPrices)"
Cohesion: 0.53
Nodes (4): reportRowDate(), reportRowsEqual(), MONEY_KEYS, maskReportRowPrices()

### Community 31 - "Request Pricing: requestPricing.js (overlapping recalculation)"
Cohesion: 0.19
Nodes (23): getAirlineMealPrice(), roundMoney(), toStoredRequestPrice(), createAllocationKey(), REQUEST_INCLUDE_FOR_PRICING, AIRLINE_PRICES_INCLUDE, hydrateAirlinePrices(), staysOverlap() (+15 more)

### Community 67 - "Bulk Request XLSX Parser: parseBulkRequestXlsx"
Cohesion: 0.28
Nodes (12): HEADER_MATCHERS, normalizeHeader(), mapHeaders(), parseExcelDate(), parseExcelTime(), combineDateAndTime(), normalizeFlightStatus(), parseIntField() (+4 more)

### Community 88 - "Room Share Matrix (report nights)"
Cohesion: 0.57
Nodes (6): parseDDMMYYYY_HHMMSS(), startOfServiceDay(), addDays(), listServiceNights(), toRu(), computeRoomShareMatrix()

### Community 1 - "Travelline: travellineService, mappers, booking & autoSyncSchedule"
Cohesion: 0.06
Nodes (18): normalizeAutoSyncHours(), isAutoSyncDue(), timePart(), buildStayDatesWithExtras(), parseVerifyResponse(), toUtcMs(), computeTzOffset(), extractCancellationPolicy() (+10 more)

### Community 46 - "FAP Tests: fapHarness, pubsub spy, transfer characterization & reject-draft"
Cohesion: 0.15
Nodes (11): withDouble(), installPubsubSpy(), releasePubsubAfterTests(), nextSeq(), runRaw(), runRaw(), withTransfer(), runRaw() (+3 more)

### Community 94 - "Price Geography Normalization Tests"
Cohesion: 0.33
Nodes (5): cityFindUnique, regionFindUnique, regionFindFirst, priceGeoFindMany, airportOnPriceFindMany

### Community 80 - "FAP Tests: report characterization (report.characterization.test)"
Cohesion: 0.31
Nodes (7): normalizeSnapshot(), runReport(), MAPPED_ROW_FIELDS, saveArgs(), makeSavedReport(), makeApprovedReport(), reportCases()

### Community 26 - "FAP Tests: prismaDouble & hotelReportVisibility"
Cohesion: 0.11
Nodes (21): READ_ONE, READ_MANY, WRITE_ONE, WRITE_MANY, COUNTERS, ALL_METHODS, clone(), modelKeys() (+13 more)

### Community 54 - "FAP Tests: living, roster & early characterization, runFapMutation"
Cohesion: 0.22
Nodes (10): runFapMutation(), completedWater(), legacyGuest(), requestWithLegacyInSecondHotel(), requestWithThreeHotels(), requestWithPlaced(), runRaw(), requestWithGroups() (+2 more)

### Community 61 - "FAP Tests: fixtureShape (fixtures vs schema)"
Cohesion: 0.14
Nodes (8): here, schema, SERVICE_FIELDS, makeHotelContext(), makeHotelRoleContext(), LINK_FIELDS, parent, outsiders

### Community 74 - "FAP Tests: list filters, query & moveDateValidation"
Cohesion: 0.22
Nodes (6): makeContext(), stageOf(), runList(), runStageList(), STAGE_SET, runRaw()

### Community 84 - "report"
Cohesion: 0.25
Nodes (6): RULES, PERIOD_START, PERIOD_END, CONTRACT, build(), SHORT_STAY

## Ambiguous Edges - Review These
- `Legacy schema migration script` → `airload.js`  [AMBIGUOUS]
  README.md · relation: conceptually_related_to
- `PubSub subscriptions and subscription context` → `corsOptions.js`  [AMBIGUOUS]
  README.md · relation: conceptually_related_to
- `Published ports 3000 and 4000` → `Host Port 4001 → Container 4000 Mapping`  [AMBIGUOUS]
  INSTALL.md · relation: conceptually_related_to

## Knowledge Gaps
- **220 isolated node(s):** `Test SUPERADMIN login credentials (admin/admin123)`, `rl`, `AUTH_ERROR_CODES`, `name`, `main` (+215 more)
  These have ≤1 connection - possible missing edges or undocumented components.
- **4 thin communities (<3 nodes) omitted from report** — run `graphify query` to explore isolated nodes.

## Suggested Questions
_Questions this graph is uniquely positioned to answer:_

- **What is the exact relationship between `Legacy schema migration script` and `airload.js`?**
  _Edge tagged AMBIGUOUS (relation: conceptually_related_to) - confidence is low._
- **What is the exact relationship between `PubSub subscriptions and subscription context` and `corsOptions.js`?**
  _Edge tagged AMBIGUOUS (relation: conceptually_related_to) - confidence is low._
- **What is the exact relationship between `Published ports 3000 and 4000` and `Host Port 4001 → Container 4000 Mapping`?**
  _Edge tagged AMBIGUOUS (relation: conceptually_related_to) - confidence is low._
- **Why does `prisma` connect `Prisma client, documentation.resolver & backfill scripts` to `Report Drafts: merge, frozen rows, changedFrom`, `Travelline: travellineService, mappers, booking & autoSyncSchedule`, `External Auth: Magic Links & Hotel Preview`, `Notifications: notificationMenuCheck, email delivery & Firebase transfer push`, `FAP Passenger Analytics & Grouping`, `User Presence & Cron Jobs: userPresence, cronTasks, reportArchive & reportDecade`, `FAP Edit Guard & Request Envelope`, `System Updates & Maintenance Banner`, `Server Entry: server.js, server2.js, jobs & shutdown`, `FAP Scope & Subscriptions`, `Report Utils: reportUtils, request stay dates & living price`, `Driver Access: driverAccess, driver.resolver & global.resolver`, `Resolvers index: resolvers.js, city, airport, log`, `Roster & Saved Passengers`, `Docker Stack Deployment`, `PubSub & Subscriptions: pubsub.js, subscriptionAuth, representative.resolver`, `Auth: user.resolver, sign-in, refresh tokens`, `Price Geography: normalizeGeography & contract-type occupancy`, `Bot Service & Webhooks`, `FAP Tests: prismaDouble & hotelReportVisibility`, `Secret Fields Hiding & Airline/Organization Resolvers: hiddenSecretFields, transferPriceContract`, `Access: assertCanManageAccess.js guards & Travelline role checks`, `Airline Analytics: airlineAnalytics & airlineAnalyticsUtils (period, budget, service blocks)`, `Support Emails & Rate Guard: supportEmailTemplates, notificationRateGuard & notifyReportSubmit`, `Request Pricing: requestPricing.js (overlapping recalculation)`, `FAP Report Stage: hotelReportStage & reportStageList`, `Merge Saved People (duplicates)`, `Report Draft Emails: reportDraftEmailTemplates & notifyReportDecision`, `Bulk Request Import & Numbering: createBulkRequests, generateRequestNumber`, `File Access Control: checkFileAccess & path normalization`, `Hotel Resolver: hotel.resolver, uploadImage, roomUtils & hotelFilters`, `Price Resolution by Hotel Location (resolvePriceByHotelLocation)`, `Passenger Request Emails: passengerRequestEmailTemplates & buildPassengerRequestEmail`, `Support Chat & Documentation Tree: supportAgent`, `Action Log: logaction.js sanitization & diff`, `Room Occupancy Overlap`, `Upload File Migration`, `Auth Middleware: role decorators (authMiddleware.js)`, `Contract Resolver & Filters`, `Airline prices hidden from hotel: hideAirlinePrices, roomKindSeason.resolver, mutationError`, `GraphQL Auth Context`, `Contract Archiving Cron: contractArchiving & archiveExpiredAgreements`, `Request Archive Guard: requestArchiveGuard (assertRequestNotArchived)`, `Migration: approvePricingForSubmittedReports`, `Airline Analytics: airlineServiceComparison (position & region metrics)`, `User Login Normalization & Legacy Migration: normalizeUserLogin, migration.js`, `Telegram API & Webhooks: telegramApi, botWebhooks`, `Positions & Dispatcher Access: positionAccess, dispatcher.resolver`, `Reserve & Meal: reserve.resolver, calculateMeal, mutationError & generateReservePas`, `Contract File Management`, `FAP Scope Readiness Probe: checkFapScopeReadiness`, `Driver Vehicle Catalog: driverVehicle (catalogVehicleNumber)`, `Person Stay Summary: personStaySummary (getPersonStaySummaries)`, `Maintenance: healPassengerHotelChessIndexes`, `Migration: migrateCityRegionsToRegionModel`, `Backfill: backfillPassengerHotelAddressCity`, `Backfill: backfillRequestReserveAirlineDepartment`, `Migration: migrateAirlinePriceGeographyToArray`, `Legacy Reports: reports.js (meal, living cost, dispatcher fee)`, `Backfill: backfill-saved-report-titles (saved report titles)`, `Backfill: backfillExternalUserScopeFields`, `Sync: syncAirportsFromJson`?**
  _High betweenness centrality (0.298) - this node is a cross-community bridge._
- **Why does `dependencies` connect `package.json: dependencies (graphql-tools, yoga redis, axios, cors)` to `Backend tech stack: @apollo/server, express, jsonwebtoken, argon2, pm2`, `File Access Control: checkFileAccess & path normalization`, `Email Notifications: notificationMenuCheck, sendRequestPartyEmail & departmentEmailDelivery`, `TOTP Two-Factor Auth: speakeasy & qrcode`, `Package Config & Nodemon`?**
  _High betweenness centrality (0.059) - this node is a cross-community bridge._
- **Why does `logger` connect `Winston File Logger` to `Travelline: travellineService, mappers, booking & autoSyncSchedule`, `Notifications: notificationMenuCheck, email delivery & Firebase transfer push`, `User Presence & Cron Jobs: userPresence, cronTasks, reportArchive & reportDecade`, `FAP Edit Guard & Request Envelope`, `Server Entry: server.js, server2.js, jobs & shutdown`, `FAP Scope & Subscriptions`, `Driver Access: driverAccess, driver.resolver & global.resolver`, `Resolvers index: resolvers.js, city, airport, log`, `Passenger Request Files: uploadFiles, deleteFiles`, `PubSub & Subscriptions: pubsub.js, subscriptionAuth, representative.resolver`, `Auth: user.resolver, sign-in, refresh tokens`, `Secret Fields Hiding & Airline/Organization Resolvers: hiddenSecretFields, transferPriceContract`, `Access: assertCanManageAccess.js guards & Travelline role checks`, `Request Pricing: requestPricing.js (overlapping recalculation)`, `File Access Routes & Backup`, `Bulk Request Import & Numbering: createBulkRequests, generateRequestNumber`, `File Access Control: checkFileAccess & path normalization`, `Hotel Resolver: hotel.resolver, uploadImage, roomUtils & hotelFilters`, `Action Log: logaction.js sanitization & diff`, `Upload File Migration`, `Auth Middleware: role decorators (authMiddleware.js)`, `GraphQL Auth Context`, `Contract Archiving Cron: contractArchiving & archiveExpiredAgreements`, `Contract File Management`?**
  _High betweenness centrality (0.024) - this node is a cross-community bridge._
- **Are the 4 inferred relationships involving `prisma` (e.g. with `MongoDB ReplicaSet requirement` and `MongoDB Service (single node, replica set rs0)`) actually correct?**
  _`prisma` has 4 INFERRED edges - model-reasoned connections that need verification._