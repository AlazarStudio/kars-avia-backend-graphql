# Graph Report - .  (2026-09-24)

## Corpus Check
- 383 files · ~252,104 words
- Verdict: corpus is large enough that graph structure adds value.

## Summary
- 2118 nodes · 5916 edges · 102 communities (90 shown, 12 thin omitted)
- Extraction: 95% EXTRACTED · 5% INFERRED · 0% AMBIGUOUS · INFERRED: 283 edges (avg confidence: 0.83)
- Token cost: 0 input · 0 output

## Community Hubs (Navigation)
- GraphQL typeDefs: typedefs.js & per-domain schema modules
- FAP Passenger Analytics & Grouping
- Server Entry: server.js, server2.js, jobs & shutdown
- Report Archive & Decades: reportArchive.js, reportDecade.js
- Contract File Management
- Access: assertCanManageAccess.js guards & Travelline role checks
- PubSub & Subscriptions: pubsub.js, subscriptionAuth, representative.resolver
- Bot Service & Webhooks
- Auth Middleware: role decorators (authMiddleware.js)
- Email Notifications: templates, rate guard, menu check
- External Auth: Magic Links & Hotel Preview
- Action Log: logaction.js sanitization
- Backend Health & Conventions
- Room Occupancy Overlap
- Winston File Logger
- System Updates & Maintenance Banner
- Merge Saved People (duplicates)
- Email & Push Notifications
- Report Presentation & Excel export: reportPresentation, exporter
- Auth: user.resolver, sign-in, refresh tokens
- Travelline: travellineService, mappers, booking & autoSyncSchedule
- File Access Routes & Backup
- Resolvers index: resolvers.js, city, airport, log
- Backend Tech Stack
- Prisma Workflow & Scripts
- Server Entry & Auth Middleware
- GraphQL Auth Context
- TOTP Two-factor Auth
- Bot Service & Webhooks
- Package Config & Nodemon
- Docker Stack Deployment
- Package Config & Nodemon
- Bot Service & Webhooks
- File Access Routes & Backup
- Reports: reportAccess, reportEditableFields & report.resolver
- Backend Dependencies
- Email & Push Notifications
- Backend Dependencies
- Backend Dependencies
- Backend Dependencies
- Backend Dependencies
- Backend Dependencies
- Backend Dependencies
- Backend Dependencies
- Backend Dependencies
- Prisma client, documentation.resolver & backfill scripts
- Airline Resolver & Price Geography
- Contract Resolver & Filters
- Resolvers: driver, organization, uploadImage & transferPriceContract
- Airline Resolver & Price Geography
- Baggage Delivery Normalization
- FAP Scope & Subscriptions
- FAP Request Envelope: envelope.js & service resolvers
- FAP Edit Guard: fapEditGuard, serviceTable, patchIsNoop
- Transfer & Baggage Normalizers
- FAP Tests: harness, pubsub spy & characterization (transfer, waterMeal)
- Merge Saved People (duplicates)
- FAP Scope & Subscriptions
- FAP Supply Fact: coerce.js, supplyFact.js & waterMeal.resolver
- Report Drafts: merge, frozen rows, changedFrom
- Roster & Saved Passengers
- Airline Resolver & Price Geography
- Analytics & Pricing: requestPricing, reportUtils, airlineAnalytics
- Analytics & Pricing: requestPricing, reportUtils, airlineAnalytics
- Analytics & Pricing: requestPricing, reportUtils, airlineAnalytics
- Contract Archiving
- Contract Archiving
- Contract Expiration Sorting
- Upload File Migration
- Passenger Document Recognition
- Passenger Request Resolver
- Request Emails: requestEmailTemplates & frontendEntityLinks
- Passenger Request Files: uploadFiles, deleteFiles
- Airline prices hidden from hotel: hideAirlinePrices, roomKindSeason.resolver, mutationError
- Transfer Push: transferPushService & transfer.resolver
- Migration: approvePricingForSubmittedReports
- Data Backfill & Travelline
- One-off Migration Scripts
- One-off Migration Scripts
- Contract File Migration
- Passenger Request Resolver
- Passenger Request Mutations
- FAP Scope & Subscriptions
- FAP Scope & Subscriptions
- FAP Access Guards
- FAP Scope & Subscriptions
- FAP Scope & Subscriptions
- FAP Edit Guard: fapEditGuard, serviceTable, patchIsNoop
- Partial-day Settings Rules
- Report Drafts: share metadata & syncDraftPerson
- Analytics & Pricing: requestPricing, reportUtils, airlineAnalytics
- Room Share Matrix (report nights)
- Price Search Location Tests
- Price Geography Normalization Tests
- FAP Tests: harness, pubsub spy & characterization (transfer, waterMeal)
- FAP Tests: prismaDouble & hotelReportVisibility
- FAP Tests: living & roster characterization fixtures
- Passenger Request Resolver
- FAP Tests: list filters, query & moveDateValidation
- Passenger Request Resolver
- FAP Scope & Subscriptions
- Passenger Request Resolver

## God Nodes (most connected - your core abstractions)
1. `prisma` - 120 edges
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
- `File and document generation` --semantically_similar_to--> `File access control and path normalization`  [INFERRED] [semantically similar]
  CLAUDE.md → README.md
- `File access control and path normalization` --semantically_similar_to--> `Secure File Access System`  [INFERRED] [semantically similar]
  README.md → services/files/README.md

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

## Communities (102 total, 12 thin omitted)

### Community 18 - "GraphQL typeDefs: typedefs.js & per-domain schema modules"
Cohesion: 0.08
Nodes (10): Kars Avia GraphQL Backend, Composite Prisma types (Information, Price, MealPrice, MealPlan), Driver / representative / organization entities, File access control and path normalization, Global shared schema and resolver layer, HotelChess to Room relation via nested connect, Report engine versioning (v5 to v7), Reserve module (+2 more)

### Community 4 - "FAP Passenger Analytics & Grouping"
Cohesion: 0.07
Nodes (54): Analytics module, analyticsResolver, buildWhereConditionsRequests(), analyticsUserRequests(), createdByPeriodForEntityRequests(), totalCreatedRequests(), totalCancelledRequests(), countRequestsByStatus() (+46 more)

### Community 10 - "Server Entry: server.js, server2.js, jobs & shutdown"
Cohesion: 0.09
Nodes (39): Unified auth middleware, Dual entry points (server2.js / server.js), Central typeDef/resolver mergers, Real-time GraphQL subscriptions, isAuthError(), mergedResolvers, require, sslOptions (+31 more)

### Community 8 - "Report Archive & Decades: reportArchive.js, reportDecade.js"
Cohesion: 0.08
Nodes (41): Cron auto-archiving of expired contracts, Legacy schema migration script, Request archiving with cron and grace period, Upload and backfill migrations, Thin resolvers, fat service layer, Scheduled cron jobs, One-off migration scripts, node-cron (+33 more)

### Community 59 - "Contract File Management"
Cohesion: 0.31
Nodes (10): Contracts module, deleteContractAndAgreementFiles(), deriveDisplayNameFromPath(), normalizeContractFiles(), extractFileUrls(), validateContractFileUploadInput(), deleteContractFileFromDisk(), deleteAllContractFilesFromDisk() (+2 more)

### Community 5 - "Access: assertCanManageAccess.js guards & Travelline role checks"
Cohesion: 0.07
Nodes (45): Department access control (accessMenu), AccessMenu feature-flag permissions, requireTravellineSection(), ACCESS_MENU_KEYS, hasOwn(), compactAccessMenu(), ADMIN_HOTEL_AIR_ROLES, hasOwn() (+37 more)

### Community 24 - "PubSub & Subscriptions: pubsub.js, subscriptionAuth, representative.resolver"
Cohesion: 0.14
Nodes (20): Dependency hygiene and resource reduction, Pagination and server payload reduction, PubSub subscriptions and subscription context, PubSub topic naming, transferResolver, DATE_FIELDS, isUserChatParticipant(), canReceiveChatSubscription() (+12 more)

### Community 35 - "Bot Service & Webhooks"
Cohesion: 0.19
Nodes (15): Documentation tree and hierarchy, Support chat separated from main chats, supportResolver, buildDocumentationTree(), sanitizeTreeInput(), dedupe(), fetchSubtreeByRoot(), getDescendantIds() (+7 more)

### Community 19 - "Auth Middleware: role decorators (authMiddleware.js)"
Cohesion: 0.13
Nodes (22): Duplicate request detection, Role-based middleware decorators, roleMiddleware(), dispatcherModerMiddleware(), superAdminMiddleware(), adminHotelAirMiddleware(), representativeMiddleware(), moderatorMiddleware() (+14 more)

### Community 0 - "Email Notifications: templates, rate guard, menu check"
Cohesion: 0.06
Nodes (65): Transactional email delivery, Firebase push notifications, Notification subsystem, Two-factor authentication (speakeasy + QR), getFrontendUrl(), getSupportEmail(), getServiceName(), esc() (+57 more)

### Community 3 - "External Auth: Magic Links & Hotel Preview"
Cohesion: 0.07
Nodes (51): External auth via magic link, SUBJECT_TYPE, EXTERNAL_SCOPES, EXTERNAL_ACCESS_TYPES, throwForbidden(), resolveAdminId(), issueTokenForExternalUser(), buildExternalAuthPayload() (+43 more)

### Community 7 - "Action Log: logaction.js sanitization"
Cohesion: 0.07
Nodes (54): Group and bulk requests, Request number generation, LARGE_ARRAY_KEYS, isPlainObject(), shouldCompactArrayByKey(), truncateString(), sanitizeLargeFields(), getByPath() (+46 more)

### Community 62 - "Backend Health & Conventions"
Cohesion: 0.21
Nodes (12): GET /health with app version, House rules for writing code, Visual style discipline, Token economy rule, KarsAvia GraphQL Backend (v3.5.0), GET /health liveness endpoint, Post-deploy verification via /health, Backend /health Healthcheck (+4 more)

### Community 14 - "Room Occupancy Overlap"
Cohesion: 0.11
Nodes (26): Hotel preview links, Meal plan calculation (MealPlan / DailyMeal), Hotel room counters and recount, Room occupancy overlap rules, hotelPreviewMiddleware(), transporter, hotelResolver, sepVariants() (+18 more)

### Community 68 - "Winston File Logger"
Cohesion: 0.42
Nodes (9): Logs as a first-class model with pagination, Winston plus monthly-rotation file logger, ensuredDirs, getTimeStamp(), getLogFilePath(), ensureLogDir(), appendLog(), logToFile() (+1 more)

### Community 12 - "System Updates & Maintenance Banner"
Cohesion: 0.11
Nodes (38): Maintenance banner with live subscription, Semver comparison gating for release visibility, System update notifications (SystemUpdate), siteResolver, hasLegacySections(), main(), getMaintenanceBanner(), updateMaintenanceBanner() (+30 more)

### Community 63 - "Email & Push Notifications"
Cohesion: 0.30
Nodes (9): Positions (должности) model consolidation, dispatcherOrSuperAdminMiddleware(), TRANSFER_NOTIFICATION_ACTIONS, dispatcherResolver, AIRLINE_POSITION_SEPARATORS, isAirlinePosition(), resolveAirlineId(), assertAirlinePositionForUser() (+1 more)

### Community 39 - "Report Presentation & Excel export: reportPresentation, exporter"
Cohesion: 0.22
Nodes (15): Report exporter (XLSX styling, sorting, PDF conversion), writeExcelAndSave(), colLetter(), writeStyledWorkbook(), generateExcelAvia(), generateExcelHotel(), formatReportCurrency(), formatCellRaw() (+7 more)

### Community 2 - "Auth: user.resolver, sign-in, refresh tokens"
Cohesion: 0.07
Nodes (53): Access/refresh token lifecycle, User presence and last-visit tracking, SUBJECT, resolveAuthSubject(), globalResolver, buildUserAuthPayload(), normalizeUserLogin(), registerSelfUser() (+45 more)

### Community 1 - "Travelline: travellineService, mappers, booking & autoSyncSchedule"
Cohesion: 0.06
Nodes (19): TravelLine integration, normalizeAutoSyncHours(), isAutoSyncDue(), timePart(), buildStayDatesWithExtras(), parseVerifyResponse(), toUtcMs(), computeTzOffset() (+11 more)

### Community 23 - "File Access Routes & Backup"
Cohesion: 0.13
Nodes (26): Secure File Access System, Automatic File Path Normalization (/uploads → /files/uploads), JWT Bearer Authorization for File Downloads, File Access Rules by Role, Dual Path Format Backward Compatibility, Protected /files/* Route, Storage Roots (uploads, reports, reserve_files), JWT-protected /files/* route (+18 more)

### Community 27 - "Resolvers index: resolvers.js, city, airport, log"
Cohesion: 0.11
Nodes (16): File Path Field Resolvers (Request.files, Hotel.images, ReportFile.url, …), allMiddleware(), airlineResolver, airportResolver, chatResolver, cityInclude, cityResolver, documentationResolver (+8 more)

### Community 33 - "Backend Tech Stack"
Cohesion: 0.11
Nodes (21): Backend tech stack, Browser → React SPA → GraphQL API → MongoDB flow, @apollo/server, @apollo/server, @graphql-tools/merge, @graphql-tools/merge, @prisma/client, argon2 (+13 more)

### Community 38 - "Prisma Workflow & Scripts"
Cohesion: 0.19
Nodes (19): npm script catalogue, Schema-first Prisma workflow, generated/client is not hand-editable, scripts, backup, start, start2, production (+11 more)

### Community 67 - "Server Entry & Auth Middleware"
Cohesion: 0.24
Nodes (8): Environment variable contract (.env), .env is committed with dev values, .env.docker and .env.example configuration, wsKeepAliveParsed, wsKeepAliveParsed, __filename, __dirname, serviceAccountPath

### Community 46 - "GraphQL Auth Context"
Cohesion: 0.21
Nodes (12): JWT authentication into GraphQL context, EMPTY_TOKEN_VALUES, AUTH_ERROR_CODES, AuthError, extractToken(), isLikelyJwt(), raiseAuthError(), buildAuthContext() (+4 more)

### Community 79 - "TOTP Two-factor Auth"
Cohesion: 0.29
Nodes (7): TOTP two-factor authentication, @levminer/speakeasy, @levminer/speakeasy, qrcode, qrcode, speakeasy, speakeasy

### Community 55 - "Bot Service & Webhooks"
Cohesion: 0.14
Nodes (10): Redis-backed pub/sub for multi-instance, @graphql-yoga/redis-event-target, @graphql-yoga/redis-event-target, ioredis, ioredis, pm2, pm2, removeContractFileRecord() (+2 more)

### Community 70 - "Package Config & Nodemon"
Cohesion: 0.22
Nodes (9): File and document generation, exceljs, exceljs, graphql-upload, graphql-upload, pdfkit, pdfkit, sharp (+1 more)

### Community 26 - "Docker Stack Deployment"
Cohesion: 0.15
Nodes (26): MongoDB ReplicaSet requirement, KarsAvia deployment guide (v3.5.0), Host system requirements, Backend and frontend must be sibling directories, docker compose up --build first-run sequence, Empty database on first deployment, Test SUPERADMIN login credentials (admin/admin123), Docker Compose three-container stack (+18 more)

### Community 41 - "Package Config & Nodemon"
Cohesion: 0.11
Nodes (17): Nodemon ignores runtime write directories, name, main, type, keywords, author, license, description (+9 more)

### Community 13 - "Bot Service & Webhooks"
Cohesion: 0.11
Nodes (16): Telegram Support Message Data Flow, Incoming Stage: Telegram Bot → Webhook/Polling → handleIncomingMessage, Message Persistence Stage (Message record in DB), Real-time Fan-out Stage: pubsub.publish(MESSAGE_SENT), Admin UI Subscription Stage, Admin Reply Stage (sendMessage mutation), Outbound Delivery Stage (bot.sendMessage back to Telegram), router (+8 more)

### Community 69 - "File Access Routes & Backup"
Cohesion: 0.36
Nodes (8): rl, showMenu(), handleUserInput(), __filename, __dirname, createBackup(), restoreBackup(), listBackups()

### Community 58 - "Reports: reportAccess, reportEditableFields & report.resolver"
Cohesion: 0.23
Nodes (8): adminMiddleware(), hotelAdminMiddleware(), draftInclude, assertDraftAccess(), assertSavedReportAccess(), reportResolver, REPORT_EDITABLE_FIELD_KEYS, normalizeReportEditableFields()

### Community 20 - "Backend Dependencies"
Cohesion: 0.06
Nodes (31): dependencies, @graphql-tools/schema, @graphql-tools/schema, @maxhub/max-bot-api, @maxhub/max-bot-api, archetype, archetype, axios (+23 more)

### Community 71 - "Email & Push Notifications"
Cohesion: 0.31
Nodes (8): @prisma/client, prisma, ACTION_FIELDS, MENU_OWNERS, isBoolean(), buildNotificationMenuBackfill(), backfillForModel(), main()

### Community 11 - "Prisma client, documentation.resolver & backfill scripts"
Cohesion: 0.07
Nodes (18): prisma, deleteSectionCascade(), getSectionsHierarchyJSONOptimized(), isObjectId(), parse(), main(), APPLY, composeHotelAddress() (+10 more)

### Community 15 - "Airline Resolver & Price Geography"
Cohesion: 0.13
Nodes (31): priceValidity(), isWindowedPrice(), syncAirlinePriceGeography(), hasOwn(), syncDepartmentPositionLinks(), buildAirlineWhere(), emptyGeo, emptyHotelLocation (+23 more)

### Community 43 - "Contract Resolver & Filters"
Cohesion: 0.21
Nodes (14): contractExpirationFields, agreementExpirationFields, appendUploadedContractFiles(), contractResolver, isArchivedContractFilter(), appendArchiveFilter(), buildAdditionalAgreementWhere(), buildAirlineContractWhere() (+6 more)

### Community 54 - "Resolvers: driver, organization, uploadImage & transferPriceContract"
Cohesion: 0.23
Nodes (9): driverResolver, organizationResolver, safeSlug(), ensureDir(), buildUploadPath(), uploadImage(), deleteImage(), dateFormatter() (+1 more)

### Community 47 - "Airline Resolver & Price Geography"
Cohesion: 0.35
Nodes (12): toDayUtc(), addDaysUtc(), listStayNights(), seasonsOverlap(), assertValidSeasonRange(), assertNoSeasonOverlap(), findSeasonForNight(), resolvePriceForNight() (+4 more)

### Community 42 - "Baggage Delivery Normalization"
Cohesion: 0.31
Nodes (14): normalizeBaggageTags(), has(), normalizeDriverPerson(), normalizePeopleForWrite(), normalizeDriversForWrite(), sumPeopleCost(), tripReportCost(), countTripPeople() (+6 more)

### Community 72 - "FAP Scope & Subscriptions"
Cohesion: 0.33
Nodes (8): stripInternalDriverFields(), viewerIsAirline(), viewerIsDispatcher(), internalOnly(), viewerHotelIndexes(), assertAirlineSubject(), assertDispatcherSubject(), resolveScope()

### Community 21 - "FAP Request Envelope: envelope.js & service resolvers"
Cohesion: 0.16
Nodes (19): getSubjectName(), loadRequestOrThrow(), assertIndex(), assertReason(), reportWhere(), finishPassengerRequestMutation(), withPassengerRequest(), forbidden() (+11 more)

### Community 48 - "FAP Edit Guard: fapEditGuard, serviceTable, patchIsNoop"
Cohesion: 0.20
Nodes (8): emptyPeopleService(), emptyLivingService(), emptyDriversService(), PASSENGER_SERVICE_TABLE, PASSENGER_SERVICE_FIELDS, findPassengerService(), passengerServiceFields(), DRIVER_SERVICES

### Community 17 - "Transfer & Baggage Normalizers"
Cohesion: 0.14
Nodes (21): mapDriverAt(), driversServicePatch(), assertMoment(), countLivingPeople(), withHotelPeople(), applyServiceRecalc(), assertHotelScopeAccess(), normalizeOptionalString() (+13 more)

### Community 36 - "FAP Tests: harness, pubsub spy & characterization (transfer, waterMeal)"
Cohesion: 0.24
Nodes (8): FAP Supply Fact: coerce.js, supplyFact.js & waterMeal.resolverResolver, normalizeSnapshot(), releasePubsubAfterTests(), runFapMutation(), here, person(), requestWithFourWaterPeople(), runSupply()

### Community 30 - "Merge Saved People (duplicates)"
Cohesion: 0.19
Nodes (18): DRIVER_FIELDS, normalizeOptionalString(), badInput(), remapId(), rebindPeopleList(), rebindDriverService(), remapGroupMemberIds(), fillKeepFromDrops() (+10 more)

### Community 31 - "FAP Scope & Subscriptions"
Cohesion: 0.19
Nodes (16): allow(), DISPATCHER_ROLES, AIRLINE_ROLES, HOTEL_ROLES, denied(), isUnrestricted(), isDenied(), isHotelSubjectScope() (+8 more)

### Community 44 - "FAP Supply Fact: coerce.js, supplyFact.js & waterMeal.resolver"
Cohesion: 0.22
Nodes (10): SUPPLY_FIELD_LABELS, normalizeBulkIndexes(), spliceAtIndexes(), blank(), toNonNegative2dp(), toWholeCountOrNull(), toTrimmedOrNull(), has() (+2 more)

### Community 22 - "Report Drafts: merge, frozen rows, changedFrom"
Cohesion: 0.15
Nodes (26): buildDraftPresentation(), REQUEST_STATUSES, requestIncludeAirline, requestIncludeHotel, buildAirlineReportData(), buildHotelReportData(), normalizeReportDraftRows(), STICKY_ROW_KEYS (+18 more)

### Community 28 - "Roster & Saved Passengers"
Cohesion: 0.21
Nodes (20): DRY_RUN, DRIVER_SERVICES, main(), normalizeOptionalString(), normalizePersonType(), normalizePersonCategory(), normalizeFullNameKey(), rosterMatchKey() (+12 more)

### Community 45 - "Airline Resolver & Price Geography"
Cohesion: 0.28
Nodes (15): normalizeGeoValue(), hasGeoValue(), applyCityRecord(), buildPriceSearchLocation(), getPriceGeographies(), sortByCreatedAtAsc(), pickFirst(), resolveByAirportContract() (+7 more)

### Community 16 - "Analytics & Pricing: requestPricing, reportUtils, airlineAnalytics"
Cohesion: 0.14
Nodes (31): getHotelLocation(), getCategoryPriceFromContract(), computeRequestCosts(), buildRequestRowForAllocation(), isArchivedRequestForPricing(), getBaseHotelPricePerDay(), TECH_POS, NOT_TECH_POS (+23 more)

### Community 9 - "Analytics & Pricing: requestPricing, reportUtils, airlineAnalytics"
Cohesion: 0.11
Nodes (43): roundMoney(), normalizeServices(), fetchRequests(), fetchTransfers(), getRequestBudget(), getServiceRequestBudget(), buildServiceRequestItems(), buildServiceAirportsFromRequests() (+35 more)

### Community 81 - "Analytics & Pricing: requestPricing, reportUtils, airlineAnalytics"
Cohesion: 0.67
Nodes (5): toDayStartUtcMs(), toInclusiveEndMs(), mergeIntervals(), countDaysFromIntervals(), getPersonStaySummaries()

### Community 65 - "Contract Archiving"
Cohesion: 0.33
Nodes (10): applyArchiveData(), applyRestoreData(), performArchiveContract(), performArchiveAgreement(), restoreContractRecordInternal(), archiveContractRecord(), restoreContractRecord(), restoreAgreementRecordInternal() (+2 more)

### Community 64 - "Contract Archiving"
Cohesion: 0.33
Nodes (11): buildExpiredNoProlongationWhere(), archiveContractRecordInternal(), archiveAgreementRecordInternal(), publishContractUpdate(), archiveExpiredContracts(), getAgreementParentTopic(), loadAgreementParentContract(), archiveExpiredAgreements() (+3 more)

### Community 49 - "Contract Expiration Sorting"
Cohesion: 0.18
Nodes (13): startOfUtcDay(), addUtcMonths(), getContractExpirationMeta(), compareContractsByExpiration(), sortContractsByExpiration(), assert(), now, contractWhere (+5 more)

### Community 37 - "Upload File Migration"
Cohesion: 0.18
Nodes (19): replaceUrlInContractFiles(), UPLOADS_ROOT, REPORTS_ROOT, REPORT_ROOT, ensureDir(), isTopLevelFile(), getFileDateParts(), buildTargetDir() (+11 more)

### Community 25 - "Passenger Document Recognition"
Cohesion: 0.14
Nodes (13): EXTRACTION_PROMPT, prepareImage(), collapse(), normalizeFields(), computeConfidence(), EMPTY_RESULT, recognizePassengerDocument(), parseGptJson() (+5 more)

### Community 6 - "Request Emails: requestEmailTemplates & frontendEntityLinks"
Cohesion: 0.10
Nodes (48): escapeHtml(), withChatId(), buildRequestCardUrl(), buildPassengerRequestCardUrl(), buildSavedReportUrl(), buildReportDraftUrl(), buildEntityChatUrl(), esc() (+40 more)

### Community 50 - "Passenger Request Files: uploadFiles, deleteFiles"
Cohesion: 0.28
Nodes (13): safeSlug(), ensureDir(), buildUploadPath(), uploadBuffer(), uploadFiles(), resolveAbsoluteFilePath(), deleteFiles(), canonicalFilePath() (+5 more)

### Community 66 - "Airline prices hidden from hotel: hideAirlinePrices, roomKindSeason.resolver, mutationError"
Cohesion: 0.33
Nodes (9): AIRLINE_PRICE_KEYS, NESTED_LISTS, shouldHideAirlinePrices(), omitAirlineKeys(), omitAirlinePriceWrites(), hiddenAirlinePrice(), hiddenAirlineFlag(), hotelContext (+1 more)

### Community 32 - "Transfer Push: transferPushService & transfer.resolver"
Cohesion: 0.19
Nodes (20): SUBJECT, getSubjectTokenWhere(), sendToToken(), sendToTokens(), sendNotificationToUser(), sendNotificationToSubject(), sendNotificationToUsers(), SUBJECT (+12 more)

### Community 51 - "Migration: approvePricingForSubmittedReports"
Cohesion: 0.18
Nodes (14): DRY_RUN, WHERE, FIELDS, selectReportsToApprove(), approvalDataFor(), moment(), run(), main() (+6 more)

### Community 86 - "Data Backfill & Travelline"
Cohesion: 0.80
Nodes (4): resolveDepartmentFromRecord(), backfillRequests(), backfillReserves(), main()

### Community 75 - "One-off Migration Scripts"
Cohesion: 0.36
Nodes (7): DISPATCHER_ROLES, AIRLINE_ROLES, HOTEL_ROLES, KNOWN_ROLES, sample(), countDangling(), main()

### Community 87 - "One-off Migration Scripts"
Cohesion: 0.80
Nodes (4): toObjectIdString(), hasLegacyGeography(), fetchLegacyPriceDocs(), main()

### Community 73 - "Contract File Migration"
Cohesion: 0.33
Nodes (8): DRY_RUN, TARGETS, LEGACY_FILES_FILTER, hasLegacyFiles(), fetchLegacyDocs(), updateLegacyDoc(), migrateModel(), main()

### Community 52 - "Passenger Request Resolver"
Cohesion: 0.17
Nodes (8): HOTEL_CHESS_LOG_ACTIONS, KARS_FALLBACK_ACTIONS, resolveEmailActionForLog(), getDispatcherFallbackForPassengerEmail(), runRaw(), withBaggage(), runRaw(), withTransfer()

### Community 82 - "Passenger Request Mutations"
Cohesion: 0.47
Nodes (3): closesBeforeStart(), closeOpenChess(), AT

### Community 76 - "FAP Scope & Subscriptions"
Cohesion: 0.36
Nodes (5): cache, defaultDeps, keyOf(), catalogVehicleNumber(), resetCatalogVehicleCache()

### Community 83 - "FAP Scope & Subscriptions"
Cohesion: 0.60
Nodes (4): publishPassengerRequestUpdated(), overlayIdentity(), hydrateDriverService(), hydratePassengerRequest()

### Community 74 - "FAP Access Guards"
Cohesion: 0.44
Nodes (6): ALLOWED_SUBJECT_TYPES, assertFapSubject(), guardResolver(), guardSection(), guardSubscriptions(), withFapAuthGuard()

### Community 60 - "FAP Scope & Subscriptions"
Cohesion: 0.29
Nodes (11): hotelIndexesForScope(), PASSENGER_REPORT_STAGES, passengerReportStageIndex(), stageDates(), hotelReportStage(), reportsByHotelIndex(), visibleReportHotelIndexes(), requestReportStage() (+3 more)

### Community 84 - "FAP Scope & Subscriptions"
Cohesion: 0.53
Nodes (4): reportRowDate(), reportRowsEqual(), MONEY_KEYS, maskReportRowPrices()

### Community 56 - "Partial-day Settings Rules"
Cohesion: 0.29
Nodes (12): getDefaultPartialDayRules(), parseHhMmToMinutes(), assertValidHhMm(), settingToRules(), rulesToCalcConfig(), ensureGlobalPartialDaySetting(), resolvePartialDayRules(), validateLevelEntity() (+4 more)

### Community 57 - "Report Drafts: share metadata & syncDraftPerson"
Cohesion: 0.26
Nodes (11): parseLocalDT(), formatLocal(), findOverlapClusters(), buildShareSegmentsForGuest(), buildShareNoteFromSegments(), buildShareClusterId(), enrichRowsWithShareMetadata(), recomputeReportDraftShareMetadata() (+3 more)

### Community 34 - "Analytics & Pricing: requestPricing, reportUtils, airlineAnalytics"
Cohesion: 0.22
Nodes (20): roundMoney(), toStoredRequestPrice(), createAllocationKey(), REQUEST_INCLUDE_FOR_PRICING, AIRLINE_PRICES_INCLUDE, hydrateAirlinePrices(), staysOverlap(), clusterForRequest() (+12 more)

### Community 80 - "Room Share Matrix (report nights)"
Cohesion: 0.57
Nodes (6): parseDDMMYYYY_HHMMSS(), startOfServiceDay(), addDays(), listServiceNights(), toRu(), computeRoomShareMatrix()

### Community 85 - "Price Geography Normalization Tests"
Cohesion: 0.33
Nodes (5): cityFindUnique, regionFindUnique, regionFindFirst, priceGeoFindMany, airportOnPriceFindMany

### Community 61 - "FAP Tests: harness, pubsub spy & characterization (transfer, waterMeal)"
Cohesion: 0.18
Nodes (8): installPubsubSpy(), runRaw(), runRaw(), runRaw(), runRaw(), airlineUser, dispatcherUser, runDraft()

### Community 29 - "FAP Tests: prismaDouble & hotelReportVisibility"
Cohesion: 0.12
Nodes (20): READ_ONE, READ_MANY, WRITE_ONE, WRITE_MANY, COUNTERS, ALL_METHODS, clone(), modelKeys() (+12 more)

### Community 53 - "FAP Tests: living & roster characterization fixtures"
Cohesion: 0.18
Nodes (11): makeEarlyCompletedWater(), completedWater(), runRaw(), legacyGuest(), requestWithLegacyInSecondHotel(), requestWithThreeHotels(), requestWithPlaced(), requestWithGroups() (+3 more)

### Community 88 - "Passenger Request Resolver"
Cohesion: 0.60
Nodes (4): runRaw(), makePerson(), requestWithLiving(), bothHotelsPopulated()

### Community 40 - "FAP Tests: list filters, query & moveDateValidation"
Cohesion: 0.15
Nodes (10): runList(), runOne(), FLIGHT_DATE_MISSING, makeContext(), makeHotelContext(), stageOf(), runList(), runStageList() (+2 more)

### Community 77 - "Passenger Request Resolver"
Cohesion: 0.32
Nodes (6): runReport(), MAPPED_ROW_FIELDS, saveArgs(), makeSavedReport(), makeApprovedReport(), reportCases()

### Community 78 - "FAP Scope & Subscriptions"
Cohesion: 0.25
Nodes (5): dispatcher, airlinePersonal, hotelExternal, own, foreign

### Community 89 - "Passenger Request Resolver"
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
- **203 isolated node(s):** `Test SUPERADMIN login credentials (admin/admin123)`, `rl`, `AUTH_ERROR_CODES`, `name`, `main` (+198 more)
  These have ≤1 connection - possible missing edges or undocumented components.
- **12 thin communities (<3 nodes) omitted from report** — run `graphify query` to explore isolated nodes.

## Suggested Questions
_Questions this graph is uniquely positioned to answer:_

- **What is the exact relationship between `Legacy schema migration script` and `airload.js`?**
  _Edge tagged AMBIGUOUS (relation: conceptually_related_to) - confidence is low._
- **What is the exact relationship between `PubSub subscriptions and subscription context` and `corsOptions.js`?**
  _Edge tagged AMBIGUOUS (relation: conceptually_related_to) - confidence is low._
- **What is the exact relationship between `Published ports 3000 and 4000` and `Host Port 4001 → Container 4000 Mapping`?**
  _Edge tagged AMBIGUOUS (relation: conceptually_related_to) - confidence is low._
- **Why does `prisma` connect `Prisma client, documentation.resolver & backfill scripts` to `Email Notifications: templates, rate guard, menu check`, `Travelline: travellineService, mappers, booking & autoSyncSchedule`, `Auth: user.resolver, sign-in, refresh tokens`, `External Auth: Magic Links & Hotel Preview`, `FAP Passenger Analytics & Grouping`, `Access: assertCanManageAccess.js guards & Travelline role checks`, `Request Emails: requestEmailTemplates & frontendEntityLinks`, `Action Log: logaction.js sanitization`, `Report Archive & Decades: reportArchive.js, reportDecade.js`, `Analytics & Pricing: requestPricing, reportUtils, airlineAnalytics`, `Server Entry: server.js, server2.js, jobs & shutdown`, `System Updates & Maintenance Banner`, `Bot Service & Webhooks`, `Room Occupancy Overlap`, `Airline Resolver & Price Geography`, `Auth Middleware: role decorators (authMiddleware.js)`, `FAP Request Envelope: envelope.js & service resolvers`, `Report Drafts: merge, frozen rows, changedFrom`, `File Access Routes & Backup`, `PubSub & Subscriptions: pubsub.js, subscriptionAuth, representative.resolver`, `Docker Stack Deployment`, `Resolvers index: resolvers.js, city, airport, log`, `Roster & Saved Passengers`, `FAP Tests: prismaDouble & hotelReportVisibility`, `Merge Saved People (duplicates)`, `Transfer Push: transferPushService & transfer.resolver`, `Analytics & Pricing: requestPricing, reportUtils, airlineAnalytics`, `Bot Service & Webhooks`, `Upload File Migration`, `Contract Resolver & Filters`, `Airline Resolver & Price Geography`, `GraphQL Auth Context`, `Airline Resolver & Price Geography`, `Migration: approvePricingForSubmittedReports`, `Resolvers: driver, organization, uploadImage & transferPriceContract`, `Partial-day Settings Rules`, `Report Drafts: share metadata & syncDraftPerson`, `Reports: reportAccess, reportEditableFields & report.resolver`, `FAP Scope & Subscriptions`, `Email & Push Notifications`, `Contract Archiving`, `FAP Scope & Subscriptions`, `Contract File Migration`, `One-off Migration Scripts`, `FAP Scope & Subscriptions`, `Analytics & Pricing: requestPricing, reportUtils, airlineAnalytics`, `Data Backfill & Travelline`, `One-off Migration Scripts`?**
  _High betweenness centrality (0.292) - this node is a cross-community bridge._
- **Why does `dependencies` connect `Backend Dependencies` to `Backend Dependencies`, `Backend Tech Stack`, `Backend Dependencies`, `Backend Dependencies`, `Backend Dependencies`, `Backend Dependencies`, `Package Config & Nodemon`, `Email & Push Notifications`, `Report Archive & Decades: reportArchive.js, reportDecade.js`, `Package Config & Nodemon`, `Backend Dependencies`, `TOTP Two-factor Auth`, `Bot Service & Webhooks`, `Backend Dependencies`, `Backend Dependencies`?**
  _High betweenness centrality (0.059) - this node is a cross-community bridge._
- **Why does `TravellineService` connect `Travelline: travellineService, mappers, booking & autoSyncSchedule` to `Resolvers index: resolvers.js, city, airport, log`, `Server Entry: server.js, server2.js, jobs & shutdown`, `Auth Middleware: role decorators (authMiddleware.js)`?**
  _High betweenness centrality (0.055) - this node is a cross-community bridge._
- **Are the 4 inferred relationships involving `prisma` (e.g. with `MongoDB ReplicaSet requirement` and `MongoDB Service (single node, replica set rs0)`) actually correct?**
  _`prisma` has 4 INFERRED edges - model-reasoned connections that need verification._