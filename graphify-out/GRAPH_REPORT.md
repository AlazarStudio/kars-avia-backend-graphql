# Graph Report - .  (2026-10-02)

## Corpus Check
- 384 files · ~252,574 words
- Verdict: corpus is large enough that graph structure adds value.

## Summary
- 2123 nodes · 5929 edges · 104 communities (98 shown, 6 thin omitted)
- Extraction: 95% EXTRACTED · 5% INFERRED · 0% AMBIGUOUS · INFERRED: 283 edges (avg confidence: 0.83)
- Token cost: 0 input · 0 output

## Community Hubs (Navigation)
- Reserve & Meal: reserve.resolver, calculateMeal, mutationError & generateReservePas
- FAP Passenger Analytics & Grouping
- Server Entry: server.js, server2.js, jobs & shutdown
- GraphQL typeDefs: typedefs.js & per-domain schema modules
- Contract Archiving
- Contract File Management
- Access Menu Keys & Effective Access
- Package Config & Nodemon
- Prisma client, documentation.resolver & backfill scripts
- Request Resolver: request.resolver, buildRequestListWhere, dateTimeFormater & updateDailyMeals
- Email Notifications: notificationMenuCheck, sendRequestPartyEmail & departmentEmailDelivery
- External Auth: Magic Links & Hotel Preview
- File Access Routes & Backup
- Transfer Push: transferPushService & transfer.resolver
- Bulk Request XLSX Parser: parseBulkRequestXlsx
- One-off Migrations: backfill.js, airload.js & supportTicketsMigration
- Winston File Logger
- System Updates & Maintenance Banner
- FAP Report Stage: hotelReportStage & reportStageList
- Positions & Dispatcher Access: positionAccess, dispatcher.resolver
- Report Drafts: merge, frozen rows, changedFrom
- User Presence & Cron Jobs: userPresence, cronTasks, reportArchive & reportDecade
- Bulk Request Import & Numbering: createBulkRequests, generateRequestNumber
- Room Occupancy Overlap
- Support Chat & Documentation Tree: supportAgent
- Auth: user.resolver, sign-in, refresh tokens
- Travelline: travellineService, mappers, booking & autoSyncSchedule
- Auth Emails: authEmailTemplates, sendAuthEmails & appConfig
- Resolvers index: resolvers.js, city, airport, log
- Storage Roots & Bind Mounts: UPLOADS_ROOT, REPORTS_ROOT, RESERVE_FILES_ROOT
- Backend Dependencies
- Prisma Workflow & Scripts
- GraphQL Auth Context
- Subscriptions Transport: ws, wsServer & graphql-ws
- PubSub & Subscriptions: pubsub.js, subscriptionAuth, representative.resolver
- Infra: Redis pub/sub & pm2 (package.json)
- Auth Middleware: role decorators (authMiddleware.js)
- Docker Stack Deployment
- Docker Volumes: karsavia-mongo-data & stack commands
- Support Chat Data Flow: Telegram -> pubsub -> admin reply
- Bot Service & Webhooks
- Telegram API & Webhooks: telegramApi, botWebhooks
- Backup CLI: backup.js & cli.js
- Reports: reportAccess, reportEditableFields & report.resolver
- Airline Resolver & Price Geography
- Contract Resolver & Filters
- Resolvers: driver, organization, uploadImage & transferPriceContract
- Airline prices hidden from hotel: hideAirlinePrices, roomKindSeason.resolver, mutationError
- Baggage Delivery Normalization
- FAP Scope & Subscriptions
- FAP Request Envelope: envelope.js & service resolvers
- FAP Edit Guard: fapEditGuard, serviceTable, patchIsNoop
- Transfer & Baggage Normalizers
- FAP Tests: supplyMutation & characterization coverage
- Merge Saved People (duplicates)
- Access: assertCanManageAccess.js guards & Travelline role checks
- Roster & Saved Passengers
- Backfill: backfill-saved-report-titles (saved report titles)
- Price Resolution by Hotel Location (resolvePriceByHotelLocation)
- Report Utils: reportUtils, request stay dates & living price
- Airline Analytics: airlineAnalytics & airlineAnalyticsUtils (period, budget, service blocks)
- Airline Analytics: airlineServiceComparison (position & region metrics)
- Person Stay Summary: personStaySummary (getPersonStaySummaries)
- User Login Normalization & Legacy Migration: normalizeUserLogin, migration.js
- Passenger Document Recognition
- Document Recognition: recognitionRateLimit
- Request Emails: requestEmailTemplates & frontendEntityLinks
- Support Emails & Rate Guard: supportEmailTemplates, notificationRateGuard & notifyReportSubmit
- Passenger Request Files: uploadFiles, deleteFiles
- Hotel Filters: hotelFilters (buildHotelWhere)
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
- Upload File Migration
- Sync: syncAirportsFromJson
- FAP: passengerRequestEmailActions & baggage characterization tests
- Hotel Chess Helpers: chessHelpers (closeOpenChess)
- Driver Vehicle Catalog: driverVehicle (catalogVehicleNumber)
- FAP Access Guards
- Hotel Report Rows: hotelReportRows (maskReportRowPrices)
- Partial-day Settings Rules
- Report Drafts: share metadata & syncDraftPerson
- Request Pricing: requestPricing.js (overlapping recalculation)
- Legacy Reports: reports.js (meal, living cost, dispatcher fee)
- Request Grouping: groupRequestsByAirlineAirportMonth
- Request Archive Guard: requestArchiveGuard (assertRequestNotArchived)
- Room Share Matrix (report nights)
- Price Search Location Tests
- Price Geography Normalization Tests
- FAP Tests: characterization suites (roster, transfer, core), fapHarness & pubsub spy
- FAP Tests: report characterization (report.characterization.test)
- FAP Tests: prismaDouble & hotelReportVisibility
- FAP Tests: living & roster characterization fixtures
- FAP Tests: livingMove characterization
- FAP Tests: list filters, query & moveDateValidation
- FAP Tests: waterMeal characterization
- FAP Tests: fixtureShape (fixtures vs schema)

## God Nodes (most connected - your core abstractions)
1. `prisma` - 121 edges
2. `installPrismaDouble()` - 53 edges
3. `TravellineService` - 50 edges
4. `pubsub` - 33 edges
5. `logger` - 32 edges
6. `makeRequest()` - 30 edges
7. `installPubsubSpy()` - 27 edges
8. `allMiddleware()` - 26 edges
9. `BotService` - 25 edges
10. `resolveScope()` - 25 edges

## Surprising Connections (you probably didn't know these)
- `Meal plan calculation (MealPlan / DailyMeal)` --shares_data_with--> `calculateMealCost()`  [INFERRED]
  README.md → services/report/reports.js
- `KarsAvia GraphQL Backend (v3.5.0)` --semantically_similar_to--> `Kars Avia GraphQL Backend`  [INFERRED] [semantically similar]
  CLAUDE.md → README.md
- `JWT authentication into GraphQL context` --semantically_similar_to--> `Unified auth middleware`  [INFERRED] [semantically similar]
  CLAUDE.md → README.md
- `Scheduled cron jobs` --semantically_similar_to--> `Cron auto-archiving of expired contracts`  [INFERRED] [semantically similar]
  CLAUDE.md → README.md
- `Meal plan calculation (MealPlan / DailyMeal)` --shares_data_with--> `calculateMealParts()`  [INFERRED]
  README.md → services/request/requestPricing.js

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

## Communities (104 total, 6 thin omitted)

### Community 57 - "Reserve & Meal: reserve.resolver, calculateMeal, mutationError & generateReservePas"
Cohesion: 0.22
Nodes (9): Kars Avia GraphQL Backend, Meal plan calculation (MealPlan / DailyMeal), Report engine versioning (v5 to v7), Reserve module, reserveResolver, isPrismaError(), rethrowUnlessInternalError(), calculateMeal() (+1 more)

### Community 4 - "FAP Passenger Analytics & Grouping"
Cohesion: 0.07
Nodes (54): Analytics module, analyticsResolver, buildWhereConditionsRequests(), analyticsUserRequests(), createdByPeriodForEntityRequests(), totalCreatedRequests(), totalCancelledRequests(), countRequestsByStatus() (+46 more)

### Community 6 - "Server Entry: server.js, server2.js, jobs & shutdown"
Cohesion: 0.07
Nodes (49): Unified auth middleware, GET /health with app version, PubSub subscriptions and subscription context, House rules for writing code, Visual style discipline, Token economy rule, KarsAvia GraphQL Backend (v3.5.0), Dual entry points (server2.js / server.js) (+41 more)

### Community 19 - "GraphQL typeDefs: typedefs.js & per-domain schema modules"
Cohesion: 0.10
Nodes (6): Composite Prisma types (Information, Price, MealPrice, MealPlan), Driver / representative / organization entities, Global shared schema and resolver layer, HotelChess to Room relation via nested connect, Room categories and tariffs, Per-domain GraphQL module layout

### Community 9 - "Contract Archiving"
Cohesion: 0.11
Nodes (35): Cron auto-archiving of expired contracts, buildExpiredNoProlongationWhere(), applyArchiveData(), applyRestoreData(), performArchiveContract(), performArchiveAgreement(), archiveContractRecordInternal(), restoreContractRecordInternal() (+27 more)

### Community 30 - "Contract File Management"
Cohesion: 0.16
Nodes (20): Contracts module, deleteContractAndAgreementFiles(), removeContractFileRecord(), deriveDisplayNameFromPath(), normalizeContractFiles(), extractFileUrls(), validateContractFileUploadInput(), deleteContractFileFromDisk() (+12 more)

### Community 41 - "Access Menu Keys & Effective Access"
Cohesion: 0.21
Nodes (12): Department access control (accessMenu), AccessMenu feature-flag permissions, ACCESS_MENU_KEYS, hasOwn(), loadEffectiveAccessMenuForUser(), hasOwn(), mergeAccessMenus(), resolveEffectiveAccessMenu() (+4 more)

### Community 34 - "Package Config & Nodemon"
Cohesion: 0.09
Nodes (21): Dependency hygiene and resource reduction, Pagination and server payload reduction, Nodemon ignores runtime write directories, Host-mounted runtime directories, name, main, type, keywords (+13 more)

### Community 29 - "Prisma client, documentation.resolver & backfill scripts"
Cohesion: 0.16
Nodes (9): Documentation tree and hierarchy, MongoDB ReplicaSet requirement, karsavia-mongo container, MongoDB port is not published, MongoDB Service (single node, replica set rs0), prisma, deleteSectionCascade(), getSectionsHierarchyJSONOptimized() (+1 more)

### Community 61 - "Request Resolver: request.resolver, buildRequestListWhere, dateTimeFormater & updateDailyMeals"
Cohesion: 0.24
Nodes (7): Duplicate request detection, transporter, reverseDateTimeFormatter(), formatDate(), updateDailyMeals(), buildRequestListWhere(), REQUEST_LIST_INCLUDE

### Community 7 - "Email Notifications: notificationMenuCheck, sendRequestPartyEmail & departmentEmailDelivery"
Cohesion: 0.10
Nodes (38): Transactional email delivery, Notification subsystem, emit(), createPerfTimer(), prisma, ACTION_FIELDS, MENU_OWNERS, isBoolean() (+30 more)

### Community 3 - "External Auth: Magic Links & Hotel Preview"
Cohesion: 0.07
Nodes (51): External auth via magic link, Hotel preview links, SUBJECT_TYPE, EXTERNAL_SCOPES, EXTERNAL_ACCESS_TYPES, throwForbidden(), resolveAdminId(), issueTokenForExternalUser() (+43 more)

### Community 23 - "File Access Routes & Backup"
Cohesion: 0.14
Nodes (23): File access control and path normalization, Secure File Access System, Automatic File Path Normalization (/uploads → /files/uploads), JWT Bearer Authorization for File Downloads, File Access Rules by Role, Dual Path Format Backward Compatibility, Protected /files/* Route, File and document generation (+15 more)

### Community 14 - "Transfer Push: transferPushService & transfer.resolver"
Cohesion: 0.10
Nodes (31): Firebase push notifications, Environment variable contract (.env), .env is committed with dev values, transferResolver, DATE_FIELDS, wsKeepAliveParsed, wsKeepAliveParsed, SUBJECT (+23 more)

### Community 58 - "Bulk Request XLSX Parser: parseBulkRequestXlsx"
Cohesion: 0.25
Nodes (13): Group and bulk requests, HEADER_MATCHERS, normalizeHeader(), mapHeaders(), parseExcelDate(), parseExcelTime(), combineDateAndTime(), normalizeFlightStatus() (+5 more)

### Community 65 - "One-off Migrations: backfill.js, airload.js & supportTicketsMigration"
Cohesion: 0.18
Nodes (7): Legacy schema migration script, Upload and backfill migrations, Thin resolvers, fat service layer, One-off migration scripts, prisma, DEFAULT, main()

### Community 64 - "Winston File Logger"
Cohesion: 0.32
Nodes (11): Logs as a first-class model with pagination, Winston plus monthly-rotation file logger, winston, winston, ensuredDirs, getTimeStamp(), getLogFilePath(), ensureLogDir() (+3 more)

### Community 8 - "System Updates & Maintenance Banner"
Cohesion: 0.11
Nodes (38): Maintenance banner with live subscription, Semver comparison gating for release visibility, System update notifications (SystemUpdate), siteResolver, hasLegacySections(), main(), getMaintenanceBanner(), updateMaintenanceBanner() (+30 more)

### Community 35 - "FAP Report Stage: hotelReportStage & reportStageList"
Cohesion: 0.17
Nodes (16): Passenger Request module, publishPassengerRequestUpdated(), ensurePassengerServiceHotelItemId(), PASSENGER_REPORT_STAGES, passengerReportStageIndex(), stageDates(), hotelReportStage(), reportsByHotelIndex() (+8 more)

### Community 68 - "Positions & Dispatcher Access: positionAccess, dispatcher.resolver"
Cohesion: 0.35
Nodes (8): Positions (должности) model consolidation, dispatcherOrSuperAdminMiddleware(), TRANSFER_NOTIFICATION_ACTIONS, AIRLINE_POSITION_SEPARATORS, isAirlinePosition(), resolveAirlineId(), assertAirlinePositionForUser(), assertPositionAccess()

### Community 10 - "Report Drafts: merge, frozen rows, changedFrom"
Cohesion: 0.11
Nodes (33): Report exporter (XLSX styling, sorting, PDF conversion), buildDraftPresentation(), writeExcelAndSave(), normalizeReportDraftRows(), colLetter(), writeStyledWorkbook(), generateExcelAvia(), generateExcelHotel() (+25 more)

### Community 5 - "User Presence & Cron Jobs: userPresence, cronTasks, reportArchive & reportDecade"
Cohesion: 0.07
Nodes (51): Request archiving with cron and grace period, User presence and last-visit tracking, Scheduled cron jobs, node-cron, node-cron, buildSavedReportListWhere(), moveExpiredToArchiving(), finalizeArchivingRequests() (+43 more)

### Community 53 - "Bulk Request Import & Numbering: createBulkRequests, generateRequestNumber"
Cohesion: 0.23
Nodes (13): Request number generation, logAction(), resolveCreatorDepartmentFromSender(), assertNoExistingLinkNumbers(), normalizeMealPlan(), createSingleBulkRequest(), importBulkRequestsFromFile(), readUploadToBuffer() (+5 more)

### Community 47 - "Room Occupancy Overlap"
Cohesion: 0.24
Nodes (14): Hotel room counters and recount, Room occupancy overlap rules, formatOverlapPeriod(), formatOverlapErrorMessage(), overlapInclude, findHotelChessOverlap(), ensureNoOverlap(), intervalsOverlap() (+6 more)

### Community 48 - "Support Chat & Documentation Tree: supportAgent"
Cohesion: 0.24
Nodes (13): Support chat separated from main chats, buildDocumentationTree(), sanitizeTreeInput(), dedupe(), fetchSubtreeByRoot(), getDescendantIds(), getAuthUser(), isSupportAgent() (+5 more)

### Community 22 - "Auth: user.resolver, sign-in, refresh tokens"
Cohesion: 0.19
Nodes (18): Access/refresh token lifecycle, buildUserAuthPayload(), registerSelfUser(), verifyEmailWithToken(), requestPasswordResetByEmail(), resetPasswordWithToken(), USER_TYPE, ROLE (+10 more)

### Community 1 - "Travelline: travellineService, mappers, booking & autoSyncSchedule"
Cohesion: 0.06
Nodes (19): TravelLine integration, normalizeAutoSyncHours(), isAutoSyncDue(), timePart(), buildStayDatesWithExtras(), parseVerifyResponse(), toUtcMs(), computeTzOffset() (+11 more)

### Community 49 - "Auth Emails: authEmailTemplates, sendAuthEmails & appConfig"
Cohesion: 0.35
Nodes (14): Two-factor authentication (speakeasy + QR), getFrontendUrl(), getSupportEmail(), getServiceName(), esc(), buildRegistrationVerifyEmail(), buildPasswordResetEmail(), buildPasswordChangedEmail() (+6 more)

### Community 15 - "Resolvers index: resolvers.js, city, airport, log"
Cohesion: 0.08
Nodes (22): File Path Field Resolvers (Request.files, Hotel.images, ReportFile.url, …), allMiddleware(), airlineResolver, airportResolver, cityInclude, cityResolver, contractResolver, dispatcherResolver (+14 more)

### Community 81 - "Storage Roots & Bind Mounts: UPLOADS_ROOT, REPORTS_ROOT, RESERVE_FILES_ROOT"
Cohesion: 0.43
Nodes (7): Storage Roots (uploads, reports, reserve_files), Backend Persistent Bind Mounts (uploads, reports, reserve_files, logs, backups), BACKUP_DIR, RESERVE_FILES_ROOT, UPLOADS_ROOT, REPORTS_ROOT, RESERVE_FILES_ROOT

### Community 0 - "Backend Dependencies"
Cohesion: 0.03
Nodes (75): Backend tech stack, TOTP two-factor authentication, generated/client is not hand-editable, Browser → React SPA → GraphQL API → MongoDB flow, dependencies, @apollo/server, @apollo/server, @graphql-tools/merge (+67 more)

### Community 46 - "Prisma Workflow & Scripts"
Cohesion: 0.21
Nodes (18): npm script catalogue, Schema-first Prisma workflow, scripts, backup, start, start2, production, dev (+10 more)

### Community 45 - "GraphQL Auth Context"
Cohesion: 0.18
Nodes (14): JWT authentication into GraphQL context, EMPTY_TOKEN_VALUES, AUTH_ERROR_CODES, AuthError, extractToken(), isLikelyJwt(), raiseAuthError(), buildAuthContext() (+6 more)

### Community 80 - "Subscriptions Transport: ws, wsServer & graphql-ws"
Cohesion: 0.29
Nodes (7): Real-time GraphQL subscriptions, graphql-ws, graphql-ws, ws, ws, wsServer, wsServer

### Community 52 - "PubSub & Subscriptions: pubsub.js, subscriptionAuth, representative.resolver"
Cohesion: 0.25
Nodes (12): PubSub topic naming, isUserChatParticipant(), canReceiveChatSubscription(), canReceiveChatReadSubscription(), publishNewUnreadToSupportClients(), newUnreadMessageTopic(), messageReadTopic(), pubSubEngine (+4 more)

### Community 71 - "Infra: Redis pub/sub & pm2 (package.json)"
Cohesion: 0.20
Nodes (7): Redis-backed pub/sub for multi-instance, @graphql-yoga/redis-event-target, @graphql-yoga/redis-event-target, ioredis, ioredis, RedisEventTargetPubSub, createPubSubEngine()

### Community 31 - "Auth Middleware: role decorators (authMiddleware.js)"
Cohesion: 0.16
Nodes (18): Role-based middleware decorators, roleMiddleware(), dispatcherModerMiddleware(), superAdminMiddleware(), adminHotelAirMiddleware(), representativeMiddleware(), moderatorMiddleware(), hotelModerMiddleware() (+10 more)

### Community 38 - "Docker Stack Deployment"
Cohesion: 0.19
Nodes (19): KarsAvia deployment guide (v3.5.0), Host system requirements, Backend and frontend must be sibling directories, docker compose up --build first-run sequence, Empty database on first deployment, Test SUPERADMIN login credentials (admin/admin123), Docker Compose three-container stack, karsavia-frontend container (+11 more)

### Community 97 - "Docker Volumes: karsavia-mongo-data & stack commands"
Cohesion: 0.67
Nodes (4): karsavia-mongo-data Docker volume, Stack management commands, docker compose down -v destroys all data, karsavia-mongo-data Named Volume

### Community 82 - "Support Chat Data Flow: Telegram -> pubsub -> admin reply"
Cohesion: 0.57
Nodes (7): Telegram Support Message Data Flow, Message Persistence Stage (Message record in DB), Real-time Fan-out Stage: pubsub.publish(MESSAGE_SENT), Admin UI Subscription Stage, Admin Reply Stage (sendMessage mutation), Outbound Delivery Stage (bot.sendMessage back to Telegram), chatResolver

### Community 67 - "Telegram API & Webhooks: telegramApi, botWebhooks"
Cohesion: 0.35
Nodes (8): router, buildSenderName(), buildTelegramUrl(), buildUserData(), parseTelegramUpdate(), sendTelegramMessage(), setTelegramWebhook(), deleteTelegramWebhook()

### Community 72 - "Backup CLI: backup.js & cli.js"
Cohesion: 0.36
Nodes (8): rl, showMenu(), handleUserInput(), __filename, __dirname, createBackup(), restoreBackup(), listBackups()

### Community 42 - "Reports: reportAccess, reportEditableFields & report.resolver"
Cohesion: 0.21
Nodes (12): adminMiddleware(), hotelAdminMiddleware(), airlineAdminMiddleware(), draftInclude, assertDraftAccess(), assertSavedReportAccess(), isDispatcherUser(), isAirlineOrgUser() (+4 more)

### Community 16 - "Airline Resolver & Price Geography"
Cohesion: 0.13
Nodes (31): priceValidity(), isWindowedPrice(), syncAirlinePriceGeography(), hasOwn(), syncDepartmentPositionLinks(), buildAirlineWhere(), emptyGeo, emptyHotelLocation (+23 more)

### Community 54 - "Contract Resolver & Filters"
Cohesion: 0.23
Nodes (13): contractExpirationFields, agreementExpirationFields, appendUploadedContractFiles(), isArchivedContractFilter(), appendArchiveFilter(), buildAdditionalAgreementWhere(), buildAirlineContractWhere(), buildHotelContractWhere() (+5 more)

### Community 50 - "Resolvers: driver, organization, uploadImage & transferPriceContract"
Cohesion: 0.20
Nodes (10): driverResolver, organizationResolver, safeSlug(), ensureDir(), buildUploadPath(), uploadImage(), deleteImage(), dateFormatter() (+2 more)

### Community 62 - "Airline prices hidden from hotel: hideAirlinePrices, roomKindSeason.resolver, mutationError"
Cohesion: 0.29
Nodes (9): AIRLINE_PRICE_KEYS, NESTED_LISTS, shouldHideAirlinePrices(), omitAirlineKeys(), omitAirlinePriceWrites(), hiddenAirlinePrice(), hiddenAirlineFlag(), hotelContext (+1 more)

### Community 20 - "Baggage Delivery Normalization"
Cohesion: 0.20
Nodes (21): normalizeBaggageTags(), has(), normalizeDriverPerson(), normalizePeopleForWrite(), normalizeDriversForWrite(), sumPeopleCost(), tripReportCost(), countTripPeople() (+13 more)

### Community 11 - "FAP Scope & Subscriptions"
Cohesion: 0.10
Nodes (30): stripInternalDriverFields(), viewerIsAirline(), viewerIsDispatcher(), internalOnly(), viewerHotelIndexes(), assertAirlineSubject(), allow(), assertDispatcherSubject() (+22 more)

### Community 17 - "FAP Request Envelope: envelope.js & service resolvers"
Cohesion: 0.14
Nodes (19): getSubjectName(), loadRequestOrThrow(), assertIndex(), assertMoment(), assertReason(), reportWhere(), emptyLivingService(), finishPassengerRequestMutation() (+11 more)

### Community 12 - "FAP Edit Guard: fapEditGuard, serviceTable, patchIsNoop"
Cohesion: 0.11
Nodes (22): SUPPLY_FIELD_LABELS, normalizeBulkIndexes(), spliceAtIndexes(), mapDriverAt(), driversServicePatch(), emptyPeopleService(), emptyDriversService(), getTransferField() (+14 more)

### Community 36 - "Transfer & Baggage Normalizers"
Cohesion: 0.20
Nodes (14): countLivingPeople(), withHotelPeople(), applyServiceRecalc(), assertHotelScopeAccess(), notifyHotelOverbookIfCrossed(), normalizeOptionalString(), ensureAccommodationChesses(), ensureHotelPerson() (+6 more)

### Community 77 - "FAP Tests: supplyMutation & characterization coverage"
Cohesion: 0.32
Nodes (3): passengerRequestResolver, here, runSupply()

### Community 32 - "Merge Saved People (duplicates)"
Cohesion: 0.19
Nodes (18): DRIVER_FIELDS, normalizeOptionalString(), badInput(), remapId(), rebindPeopleList(), rebindDriverService(), remapGroupMemberIds(), fillKeepFromDrops() (+10 more)

### Community 26 - "Access: assertCanManageAccess.js guards & Travelline role checks"
Cohesion: 0.18
Nodes (22): requireTravellineSection(), compactAccessMenu(), ADMIN_HOTEL_AIR_ROLES, hasOwn(), forbidden(), unauthenticated(), getActor(), isSuperAdminRole() (+14 more)

### Community 24 - "Roster & Saved Passengers"
Cohesion: 0.22
Nodes (19): DRY_RUN, DRIVER_SERVICES, main(), normalizeOptionalString(), normalizePersonCategory(), normalizeFullNameKey(), rosterMatchKey(), dedupeSavedPassengers() (+11 more)

### Community 98 - "Backfill: backfill-saved-report-titles (saved report titles)"
Cohesion: 0.67
Nodes (3): DRY, cellText(), main()

### Community 25 - "Price Resolution by Hotel Location (resolvePriceByHotelLocation)"
Cohesion: 0.17
Nodes (23): normalizeGeoValue(), hasGeoValue(), getHotelLocation(), applyCityRecord(), buildPriceSearchLocation(), getPriceGeographies(), sortByCreatedAtAsc(), pickFirst() (+15 more)

### Community 13 - "Report Utils: reportUtils, request stay dates & living price"
Cohesion: 0.14
Nodes (35): getCategoryPriceFromContract(), ACTIVE_STATUSES, roundMoney(), createAllocationKey(), getVehicleType(), computeTransferSpend(), computeTransferBudgetDetails(), computeRequestCosts() (+27 more)

### Community 27 - "Airline Analytics: airlineAnalytics & airlineAnalyticsUtils (period, budget, service blocks)"
Cohesion: 0.20
Nodes (24): roundMoney(), normalizeServices(), fetchRequests(), fetchTransfers(), getRequestBudget(), getServiceRequestBudget(), buildServiceRequestItems(), buildServiceAirportsFromRequests() (+16 more)

### Community 59 - "Airline Analytics: airlineServiceComparison (position & region metrics)"
Cohesion: 0.27
Nodes (12): assertDate(), validateRange(), normalizeServices(), normalizeRegions(), buildCrewWhere(), pct(), roundMoney(), getRegionToAirportIds() (+4 more)

### Community 84 - "Person Stay Summary: personStaySummary (getPersonStaySummaries)"
Cohesion: 0.67
Nodes (5): toDayStartUtcMs(), toInclusiveEndMs(), mergeIntervals(), countDaysFromIntervals(), getPersonStaySummaries()

### Community 66 - "User Login Normalization & Legacy Migration: normalizeUserLogin, migration.js"
Cohesion: 0.29
Nodes (9): normalizeUserLogin(), prismaOld, prismaNew, migrateUsers(), migrateHotels(), migrateRooms(), migrateAirlines(), runMigration() (+1 more)

### Community 21 - "Passenger Document Recognition"
Cohesion: 0.14
Nodes (13): EXTRACTION_PROMPT, prepareImage(), collapse(), normalizeFields(), computeConfidence(), EMPTY_RESULT, recognizePassengerDocument(), parseGptJson() (+5 more)

### Community 2 - "Request Emails: requestEmailTemplates & frontendEntityLinks"
Cohesion: 0.09
Nodes (53): escapeHtml(), withChatId(), buildRequestCardUrl(), buildPassengerRequestCardUrl(), buildSavedReportUrl(), buildReportDraftUrl(), buildEntityChatUrl(), esc() (+45 more)

### Community 39 - "Support Emails & Rate Guard: supportEmailTemplates, notificationRateGuard & notifyReportSubmit"
Cohesion: 0.22
Nodes (14): esc(), span(), spanNo(), buildSupportChatUrl(), supportChatLinkHtml(), buildSupportClientMessageEmail(), emailSentAt, normalizePart() (+6 more)

### Community 55 - "Passenger Request Files: uploadFiles, deleteFiles"
Cohesion: 0.28
Nodes (13): safeSlug(), ensureDir(), buildUploadPath(), uploadBuffer(), uploadFiles(), resolveAbsoluteFilePath(), deleteFiles(), canonicalFilePath() (+5 more)

### Community 60 - "Room Kind Season Prices: roomKindSeasonPrice & resolver"
Cohesion: 0.42
Nodes (12): toDayUtc(), addDaysUtc(), listStayNights(), seasonsOverlap(), assertValidSeasonRange(), assertNoSeasonOverlap(), findSeasonForNight(), resolvePriceForNight() (+4 more)

### Community 40 - "Action Log: logaction.js sanitization & diff"
Cohesion: 0.22
Nodes (19): LARGE_ARRAY_KEYS, isPlainObject(), shouldCompactArrayByKey(), truncateString(), sanitizeLargeFields(), getByPath(), setByPath(), pick() (+11 more)

### Community 56 - "Migration: approvePricingForSubmittedReports"
Cohesion: 0.18
Nodes (14): DRY_RUN, WHERE, FIELDS, selectReportsToApprove(), approvalDataFor(), moment(), run(), main() (+6 more)

### Community 100 - "Backfill: backfillExternalUserScopeFields"
Cohesion: 0.83
Nodes (3): isObjectId(), parse(), main()

### Community 90 - "Backfill: backfillPassengerHotelAddressCity"
Cohesion: 0.60
Nodes (4): APPLY, composeHotelAddress(), sameString(), main()

### Community 91 - "Backfill: backfillRequestReserveAirlineDepartment"
Cohesion: 0.80
Nodes (4): resolveDepartmentFromRecord(), backfillRequests(), backfillReserves(), main()

### Community 78 - "FAP Scope Readiness Probe: checkFapScopeReadiness"
Cohesion: 0.36
Nodes (7): DISPATCHER_ROLES, AIRLINE_ROLES, HOTEL_ROLES, KNOWN_ROLES, sample(), countDangling(), main()

### Community 85 - "Maintenance: healPassengerHotelChessIndexes"
Cohesion: 0.53
Nodes (5): APPLY, isOpen(), findLastOpenIndex(), requestLabel(), main()

### Community 92 - "Migration: migrateAirlinePriceGeographyToArray"
Cohesion: 0.80
Nodes (4): toObjectIdString(), hasLegacyGeography(), fetchLegacyPriceDocs(), main()

### Community 86 - "Migration: migrateCityRegionsToRegionModel"
Cohesion: 0.60
Nodes (5): toObjectIdString(), normalizeRegionName(), fetchCityDocs(), ensureRegionByName(), main()

### Community 43 - "Upload File Migration"
Cohesion: 0.19
Nodes (18): UPLOADS_ROOT, REPORTS_ROOT, REPORT_ROOT, ensureDir(), isTopLevelFile(), getFileDateParts(), buildTargetDir(), normalizeUploadPath() (+10 more)

### Community 69 - "FAP: passengerRequestEmailActions & baggage characterization tests"
Cohesion: 0.25
Nodes (6): HOTEL_CHESS_LOG_ACTIONS, KARS_FALLBACK_ACTIONS, resolveEmailActionForLog(), getDispatcherFallbackForPassengerEmail(), runRaw(), withBaggage()

### Community 87 - "Hotel Chess Helpers: chessHelpers (closeOpenChess)"
Cohesion: 0.47
Nodes (3): closesBeforeStart(), closeOpenChess(), AT

### Community 79 - "Driver Vehicle Catalog: driverVehicle (catalogVehicleNumber)"
Cohesion: 0.36
Nodes (5): cache, defaultDeps, keyOf(), catalogVehicleNumber(), resetCatalogVehicleCache()

### Community 74 - "FAP Access Guards"
Cohesion: 0.44
Nodes (6): ALLOWED_SUBJECT_TYPES, assertFapSubject(), guardResolver(), guardSection(), guardSubscriptions(), withFapAuthGuard()

### Community 88 - "Hotel Report Rows: hotelReportRows (maskReportRowPrices)"
Cohesion: 0.53
Nodes (4): reportRowDate(), reportRowsEqual(), MONEY_KEYS, maskReportRowPrices()

### Community 63 - "Partial-day Settings Rules"
Cohesion: 0.32
Nodes (11): getDefaultPartialDayRules(), parseHhMmToMinutes(), assertValidHhMm(), settingToRules(), rulesToCalcConfig(), ensureGlobalPartialDaySetting(), resolvePartialDayRules(), validateLevelEntity() (+3 more)

### Community 51 - "Report Drafts: share metadata & syncDraftPerson"
Cohesion: 0.21
Nodes (14): parseLocalDT(), formatLocal(), findOverlapClusters(), buildShareSegmentsForGuest(), buildShareNoteFromSegments(), buildShareClusterId(), enrichRowsWithShareMetadata(), recomputeReportDraftShareMetadata() (+6 more)

### Community 33 - "Request Pricing: requestPricing.js (overlapping recalculation)"
Cohesion: 0.19
Nodes (22): getAirlineMealPrice(), roundMoney(), toStoredRequestPrice(), createAllocationKey(), REQUEST_INCLUDE_FOR_PRICING, AIRLINE_PRICES_INCLUDE, hydrateAirlinePrices(), staysOverlap() (+14 more)

### Community 73 - "Request Grouping: groupRequestsByAirlineAirportMonth"
Cohesion: 0.38
Nodes (9): monthFormatter, getArrivalYearMonth(), formatMonthEn(), buildGroupKey(), buildMonthLabel(), buildGroupLabel(), compareGroups(), passesGroupPeriodFilter() (+1 more)

### Community 70 - "Request Archive Guard: requestArchiveGuard (assertRequestNotArchived)"
Cohesion: 0.35
Nodes (7): forbidden(), normalizeStatus(), isRequestArchived(), requestArchiveVerdict(), assertRequestNotArchived(), assertRequestNotArchivedById(), moderator

### Community 83 - "Room Share Matrix (report nights)"
Cohesion: 0.57
Nodes (6): parseDDMMYYYY_HHMMSS(), startOfServiceDay(), addDays(), listServiceNights(), toRu(), computeRoomShareMatrix()

### Community 89 - "Price Geography Normalization Tests"
Cohesion: 0.33
Nodes (5): cityFindUnique, regionFindUnique, regionFindFirst, priceGeoFindMany, airportOnPriceFindMany

### Community 28 - "FAP Tests: characterization suites (roster, transfer, core), fapHarness & pubsub spy"
Cohesion: 0.20
Nodes (13): installPubsubSpy(), releasePubsubAfterTests(), runFapMutation(), runRaw(), makeEarlyCompletedWater(), completedWater(), runRaw(), requestWithGroups() (+5 more)

### Community 75 - "FAP Tests: report characterization (report.characterization.test)"
Cohesion: 0.31
Nodes (7): normalizeSnapshot(), runReport(), MAPPED_ROW_FIELDS, saveArgs(), makeSavedReport(), makeApprovedReport(), reportCases()

### Community 18 - "FAP Tests: prismaDouble & hotelReportVisibility"
Cohesion: 0.11
Nodes (22): READ_ONE, READ_MANY, WRITE_ONE, WRITE_MANY, COUNTERS, ALL_METHODS, clone(), modelKeys() (+14 more)

### Community 76 - "FAP Tests: living & roster characterization fixtures"
Cohesion: 0.28
Nodes (6): runRaw(), legacyGuest(), requestWithLegacyInSecondHotel(), requestWithThreeHotels(), requestWithPlaced(), makeHotelRoleContext()

### Community 94 - "FAP Tests: livingMove characterization"
Cohesion: 0.60
Nodes (4): runRaw(), makePerson(), requestWithLiving(), bothHotelsPopulated()

### Community 44 - "FAP Tests: list filters, query & moveDateValidation"
Cohesion: 0.15
Nodes (10): runList(), runOne(), FLIGHT_DATE_MISSING, makeContext(), makeHotelContext(), stageOf(), runList(), runStageList() (+2 more)

### Community 95 - "FAP Tests: waterMeal characterization"
Cohesion: 0.50
Nodes (3): runRaw(), person(), requestWithFourWaterPeople()

### Community 96 - "FAP Tests: fixtureShape (fixtures vs schema)"
Cohesion: 0.40
Nodes (3): here, schema, SERVICE_FIELDS

## Ambiguous Edges - Review These
- `Legacy schema migration script` → `airload.js`  [AMBIGUOUS]
  README.md · relation: conceptually_related_to
- `PubSub subscriptions and subscription context` → `corsOptions.js`  [AMBIGUOUS]
  README.md · relation: conceptually_related_to
- `Published ports 3000 and 4000` → `Host Port 4001 → Container 4000 Mapping`  [AMBIGUOUS]
  INSTALL.md · relation: conceptually_related_to

## Knowledge Gaps
- **204 isolated node(s):** `Test SUPERADMIN login credentials (admin/admin123)`, `rl`, `AUTH_ERROR_CODES`, `name`, `main` (+199 more)
  These have ≤1 connection - possible missing edges or undocumented components.
- **6 thin communities (<3 nodes) omitted from report** — run `graphify query` to explore isolated nodes.

## Suggested Questions
_Questions this graph is uniquely positioned to answer:_

- **What is the exact relationship between `Legacy schema migration script` and `airload.js`?**
  _Edge tagged AMBIGUOUS (relation: conceptually_related_to) - confidence is low._
- **What is the exact relationship between `PubSub subscriptions and subscription context` and `corsOptions.js`?**
  _Edge tagged AMBIGUOUS (relation: conceptually_related_to) - confidence is low._
- **What is the exact relationship between `Published ports 3000 and 4000` and `Host Port 4001 → Container 4000 Mapping`?**
  _Edge tagged AMBIGUOUS (relation: conceptually_related_to) - confidence is low._
- **Why does `prisma` connect `Prisma client, documentation.resolver & backfill scripts` to `Travelline: travellineService, mappers, booking & autoSyncSchedule`, `Request Emails: requestEmailTemplates & frontendEntityLinks`, `External Auth: Magic Links & Hotel Preview`, `FAP Passenger Analytics & Grouping`, `User Presence & Cron Jobs: userPresence, cronTasks, reportArchive & reportDecade`, `Server Entry: server.js, server2.js, jobs & shutdown`, `Email Notifications: notificationMenuCheck, sendRequestPartyEmail & departmentEmailDelivery`, `System Updates & Maintenance Banner`, `Contract Archiving`, `FAP Scope & Subscriptions`, `Report Utils: reportUtils, request stay dates & living price`, `Transfer Push: transferPushService & transfer.resolver`, `Resolvers index: resolvers.js, city, airport, log`, `Airline Resolver & Price Geography`, `FAP Request Envelope: envelope.js & service resolvers`, `FAP Tests: prismaDouble & hotelReportVisibility`, `Auth: user.resolver, sign-in, refresh tokens`, `File Access Routes & Backup`, `Roster & Saved Passengers`, `Price Resolution by Hotel Location (resolvePriceByHotelLocation)`, `Airline Analytics: airlineAnalytics & airlineAnalyticsUtils (period, budget, service blocks)`, `Contract File Management`, `Auth Middleware: role decorators (authMiddleware.js)`, `Merge Saved People (duplicates)`, `Request Pricing: requestPricing.js (overlapping recalculation)`, `FAP Report Stage: hotelReportStage & reportStageList`, `Transfer & Baggage Normalizers`, `Support Emails & Rate Guard: supportEmailTemplates, notificationRateGuard & notifyReportSubmit`, `Action Log: logaction.js sanitization & diff`, `Access Menu Keys & Effective Access`, `Reports: reportAccess, reportEditableFields & report.resolver`, `Upload File Migration`, `GraphQL Auth Context`, `Room Occupancy Overlap`, `Support Chat & Documentation Tree: supportAgent`, `Resolvers: driver, organization, uploadImage & transferPriceContract`, `Report Drafts: share metadata & syncDraftPerson`, `PubSub & Subscriptions: pubsub.js, subscriptionAuth, representative.resolver`, `Bulk Request Import & Numbering: createBulkRequests, generateRequestNumber`, `Contract Resolver & Filters`, `Migration: approvePricingForSubmittedReports`, `Reserve & Meal: reserve.resolver, calculateMeal, mutationError & generateReservePas`, `Airline Analytics: airlineServiceComparison (position & region metrics)`, `Request Resolver: request.resolver, buildRequestListWhere, dateTimeFormater & updateDailyMeals`, `Airline prices hidden from hotel: hideAirlinePrices, roomKindSeason.resolver, mutationError`, `Partial-day Settings Rules`, `One-off Migrations: backfill.js, airload.js & supportTicketsMigration`, `User Login Normalization & Legacy Migration: normalizeUserLogin, migration.js`, `Telegram API & Webhooks: telegramApi, botWebhooks`, `Positions & Dispatcher Access: positionAccess, dispatcher.resolver`, `Request Archive Guard: requestArchiveGuard (assertRequestNotArchived)`, `FAP Scope Readiness Probe: checkFapScopeReadiness`, `Driver Vehicle Catalog: driverVehicle (catalogVehicleNumber)`, `Support Chat Data Flow: Telegram -> pubsub -> admin reply`, `Person Stay Summary: personStaySummary (getPersonStaySummaries)`, `Maintenance: healPassengerHotelChessIndexes`, `Migration: migrateCityRegionsToRegionModel`, `Backfill: backfillPassengerHotelAddressCity`, `Backfill: backfillRequestReserveAirlineDepartment`, `Migration: migrateAirlinePriceGeographyToArray`, `Legacy Reports: reports.js (meal, living cost, dispatcher fee)`, `Backfill: backfill-saved-report-titles (saved report titles)`, `Backfill: backfillExternalUserScopeFields`, `Sync: syncAirportsFromJson`, `Hotel Filters: hotelFilters (buildHotelWhere)`?**
  _High betweenness centrality (0.311) - this node is a cross-community bridge._
- **Why does `dependencies` connect `Backend Dependencies` to `Winston File Logger`, `Package Config & Nodemon`, `User Presence & Cron Jobs: userPresence, cronTasks, reportArchive & reportDecade`, `Infra: Redis pub/sub & pm2 (package.json)`, `GraphQL Auth Context`, `Subscriptions Transport: ws, wsServer & graphql-ws`, `File Access Routes & Backup`?**
  _High betweenness centrality (0.058) - this node is a cross-community bridge._
- **Why does `TravellineService` connect `Travelline: travellineService, mappers, booking & autoSyncSchedule` to `Request Resolver: request.resolver, buildRequestListWhere, dateTimeFormater & updateDailyMeals`, `Server Entry: server.js, server2.js, jobs & shutdown`, `Resolvers index: resolvers.js, city, airport, log`?**
  _High betweenness centrality (0.029) - this node is a cross-community bridge._
- **Are the 4 inferred relationships involving `prisma` (e.g. with `MongoDB ReplicaSet requirement` and `MongoDB Service (single node, replica set rs0)`) actually correct?**
  _`prisma` has 4 INFERRED edges - model-reasoned connections that need verification._