# Graph Report - .  (2026-09-11)

## Corpus Check
- 379 files · ~249,747 words
- Verdict: corpus is large enough that graph structure adds value.

## Summary
- 2100 nodes · 5859 edges · 98 communities (95 shown, 3 thin omitted)
- Extraction: 95% EXTRACTED · 5% INFERRED · 0% AMBIGUOUS · INFERRED: 283 edges (avg confidence: 0.83)
- Token cost: 0 input · 0 output

## Community Hubs (Navigation)
- Backend Health & Conventions
- FAP Passenger Analytics & Grouping
- Transfer Push (Firebase) & transfer.resolver
- User Presence & Stale Sessions
- Contract File Management
- Access: assertCanManageAccess.js guards & Travelline role checks
- Winston File Logger
- Bot Service & Webhooks
- Requests: number generation, bulk create & date formatting
- Email Notifications: templates, rate guard, menu check
- External Auth: Magic Links & Hotel Preview
- File Access Routes & Backup
- Backend Health & Conventions
- One-off Migration Scripts
- System Updates & Maintenance Banner
- Room Occupancy Overlap
- Merge Saved People (duplicates)
- Email & Push Notifications
- Bot Service & Webhooks
- Transfer Push (Firebase) & transfer.resolver
- Requests: number generation, bulk create & date formatting
- Room Occupancy Overlap
- Bot Service & Webhooks
- Auth: user.resolver, sign-in, refresh tokens
- Data Backfill & Travelline
- Backend Tech Stack
- Prisma Workflow & Scripts
- Server Entry & Auth Middleware
- Server Entry & Auth Middleware
- GraphQL Auth Context
- TOTP Two-factor Auth
- Bot Service & Webhooks
- Package Config & Nodemon
- Docker Stack Deployment
- Auth Middleware: role decorators & report resolver
- Bot Service & Webhooks
- Bot Service & Webhooks
- Backend Dependencies
- Documentation Tree & Backfill
- Airline Resolver & Price Geography
- Resolvers: representative, global, city, airport, log, airline
- Contract Resolver & Filters
- Resolvers: representative, global, city, airport, log, airline
- Push Notifications: Firebase tokens & transferPushService
- Airline Resolver & Price Geography
- Baggage Delivery Normalization
- Transfer & Baggage Normalizers
- FAP Request Envelope: envelope.js & service resolvers
- FAP Scope & Subscriptions
- Passenger Request Resolver
- Roster & Saved Passengers
- Auth Middleware: role decorators & report resolver
- Report Drafts: merge, frozen rows, changedFrom
- Push Notifications: Firebase tokens & transferPushService
- analytics
- Contract Archiving
- Contract File Management
- User Presence & Stale Sessions
- Auth: user.resolver, sign-in, refresh tokens
- Passenger Document Recognition
- Passenger Request Resolver
- Passenger Request Emails
- Passenger Request Emails
- Action Log: logaction.js sanitization
- migrations
- Documentation Tree & Backfill
- Email & Push Notifications
- Documentation Tree & Backfill
- Data Backfill & Travelline
- One-off Migration Scripts
- Data Backfill & Travelline
- One-off Migration Scripts
- One-off Migration Scripts
- Contract File Migration
- Upload File Migration
- Passenger Request Resolver
- Passenger Request Mutations
- FAP Access Guards
- FAP Edit Guard & Request Envelope
- Living Resolver & Hotel Chess
- FAP Edit Guard: fapEditGuard, serviceTable, patchIsNoop
- FAP Edit Guard: fapEditGuard, serviceTable, patchIsNoop
- Partial-day Settings Rules
- Report Drafts: merge, frozen rows, changedFrom
- Report Drafts: merge, frozen rows, changedFrom
- Request Resolver & Bulk Import
- Room Share Matrix (report nights)
- Auth: user.resolver, sign-in, refresh tokens
- Price Search Location Tests
- Contract Expiration Sorting
- Price Geography Normalization Tests
- Passenger Request Resolver
- Passenger Request Resolver
- Passenger Request Resolver
- Passenger Request Resolver
- Passenger Request Resolver
- Passenger Request Resolver
- Passenger Request Resolver

## God Nodes (most connected - your core abstractions)
1. `prisma` - 120 edges
2. `installPrismaDouble()` - 51 edges
3. `TravellineService` - 50 edges
4. `pubsub` - 33 edges
5. `logger` - 32 edges
6. `makeRequest()` - 29 edges
7. `installPubsubSpy()` - 27 edges
8. `allMiddleware()` - 26 edges
9. `BotService` - 25 edges
10. `resolveScope()` - 20 edges

## Surprising Connections (you probably didn't know these)
- `Meal plan calculation (MealPlan / DailyMeal)` --shares_data_with--> `calculateMealCost()`  [INFERRED]
  README.md → services/report/reports.js
- `Environment variable contract (.env)` --references--> `serviceAccountPath`  [INFERRED]
  CLAUDE.md → src/lib/firebaseAdmin.js
- `Real-time GraphQL subscriptions` --references--> `wsServer`  [INFERRED]
  CLAUDE.md → server2.js
- `JWT authentication into GraphQL context` --semantically_similar_to--> `Unified auth middleware`  [INFERRED] [semantically similar]
  CLAUDE.md → README.md
- `File and document generation` --semantically_similar_to--> `File access control and path normalization`  [INFERRED] [semantically similar]
  CLAUDE.md → README.md

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

## Communities (98 total, 3 thin omitted)

### Community 70 - "Backend Health & Conventions"
Cohesion: 0.25
Nodes (9): Kars Avia GraphQL Backend, Unified auth middleware, House rules for writing code, Visual style discipline, Token economy rule, KarsAvia GraphQL Backend (v3.5.0), Dual entry points (server2.js / server.js), sslOptions (+1 more)

### Community 5 - "FAP Passenger Analytics & Grouping"
Cohesion: 0.06
Nodes (56): Analytics module, User presence and last-visit tracking, dispatcherOrSuperAdminMiddleware(), analyticsResolver, buildWhereConditionsRequests(), analyticsUserRequests(), createdByPeriodForEntityRequests(), totalCreatedRequests() (+48 more)

### Community 17 - "Transfer Push (Firebase) & transfer.resolver"
Cohesion: 0.09
Nodes (6): Composite Prisma types (Information, Price, MealPrice, MealPlan), Driver / representative / organization entities, Global shared schema and resolver layer, HotelChess to Room relation via nested connect, Reserve module, Per-domain GraphQL module layout

### Community 71 - "User Presence & Stale Sessions"
Cohesion: 0.44
Nodes (8): Cron auto-archiving of expired contracts, Request archiving with cron and grace period, Scheduled cron jobs, moveExpiredToArchiving(), finalizeArchivingRequests(), checkAndArchiveRequests(), startArchivingJob(), publishRequestUpdated()

### Community 60 - "Contract File Management"
Cohesion: 0.35
Nodes (11): Contracts module, appendUploadedContractFiles(), deriveDisplayNameFromPath(), normalizeContractFiles(), extractFileUrls(), validateContractFileUploadInput(), uploadContractFiles(), findContractFileIndex() (+3 more)

### Community 7 - "Access: assertCanManageAccess.js guards & Travelline role checks"
Cohesion: 0.08
Nodes (40): Department access control (accessMenu), AccessMenu feature-flag permissions, requireTravellineSection(), ACCESS_MENU_KEYS, hasOwn(), compactAccessMenu(), ADMIN_HOTEL_AIR_ROLES, hasOwn() (+32 more)

### Community 63 - "Winston File Logger"
Cohesion: 0.32
Nodes (11): Dependency hygiene and resource reduction, Logs as a first-class model with pagination, Pagination and server payload reduction, Winston plus monthly-rotation file logger, ensuredDirs, getTimeStamp(), getLogFilePath(), ensureLogDir() (+3 more)

### Community 67 - "Bot Service & Webhooks"
Cohesion: 0.36
Nodes (7): Documentation tree and hierarchy, supportResolver, buildDocumentationTree(), sanitizeTreeInput(), dedupe(), fetchSubtreeByRoot(), getDescendantIds()

### Community 22 - "Requests: number generation, bulk create & date formatting"
Cohesion: 0.15
Nodes (17): Duplicate request detection, Group and bulk requests, transporter, reverseDateTimeFormatter(), formatDate(), updateDailyMeals(), buildRequestListWhere(), REQUEST_LIST_INCLUDE (+9 more)

### Community 1 - "Email Notifications: templates, rate guard, menu check"
Cohesion: 0.05
Nodes (76): Transactional email delivery, Firebase push notifications, Notification subsystem, Two-factor authentication (speakeasy + QR), getFrontendUrl(), getSupportEmail(), getServiceName(), esc() (+68 more)

### Community 8 - "External Auth: Magic Links & Hotel Preview"
Cohesion: 0.10
Nodes (38): External auth via magic link, SUBJECT_TYPE, EXTERNAL_SCOPES, EXTERNAL_ACCESS_TYPES, throwForbidden(), resolveAdminId(), issueTokenForExternalUser(), buildExternalAuthPayload() (+30 more)

### Community 6 - "File Access Routes & Backup"
Cohesion: 0.07
Nodes (50): File access control and path normalization, Hotel preview links, Secure File Access System, Automatic File Path Normalization (/uploads → /files/uploads), File Path Field Resolvers (Request.files, Hotel.images, ReportFile.url, …), JWT Bearer Authorization for File Downloads, File Access Rules by Role, Dual Path Format Backward Compatibility (+42 more)

### Community 53 - "Backend Health & Conventions"
Cohesion: 0.14
Nodes (15): GET /health with app version, GET /health liveness endpoint, Post-deploy verification via /health, Backend /health Healthcheck, name, version, main, type (+7 more)

### Community 39 - "One-off Migration Scripts"
Cohesion: 0.14
Nodes (17): Legacy schema migration script, Upload and backfill migrations, Thin resolvers, fat service layer, One-off migration scripts, generated/client is not hand-editable, @prisma/client, @prisma/client, prisma (+9 more)

### Community 10 - "System Updates & Maintenance Banner"
Cohesion: 0.11
Nodes (38): Maintenance banner with live subscription, Semver comparison gating for release visibility, System update notifications (SystemUpdate), siteResolver, hasLegacySections(), main(), getMaintenanceBanner(), updateMaintenanceBanner() (+30 more)

### Community 49 - "Room Occupancy Overlap"
Cohesion: 0.19
Nodes (11): Meal plan calculation (MealPlan / DailyMeal), Room categories and tariffs, Hotel room counters and recount, transporter, sepVariants(), buildHotelWhere(), categoryToPlaces, calculatePlaces() (+3 more)

### Community 20 - "Merge Saved People (duplicates)"
Cohesion: 0.15
Nodes (20): Passenger Request module, ensurePassengerServiceHotelItemId(), DRIVER_FIELDS, normalizeOptionalString(), badInput(), remapId(), rebindPeopleList(), rebindDriverService() (+12 more)

### Community 66 - "Email & Push Notifications"
Cohesion: 0.35
Nodes (8): Positions (должности) model consolidation, TRANSFER_NOTIFICATION_ACTIONS, dispatcherResolver, AIRLINE_POSITION_SEPARATORS, isAirlinePosition(), resolveAirlineId(), assertAirlinePositionForUser(), assertPositionAccess()

### Community 35 - "Bot Service & Webhooks"
Cohesion: 0.15
Nodes (11): PubSub subscriptions and subscription context, Real-time GraphQL subscriptions, PubSub topic naming, representativeResolver, logger, pubSubEngine, pubsub, subscriptionAuthMiddleware() (+3 more)

### Community 54 - "Requests: number generation, bulk create & date formatting"
Cohesion: 0.23
Nodes (13): Request number generation, logAction(), resolveCreatorDepartmentFromSender(), assertNoExistingLinkNumbers(), normalizeMealPlan(), createSingleBulkRequest(), importBulkRequestsFromFile(), readUploadToBuffer() (+5 more)

### Community 50 - "Room Occupancy Overlap"
Cohesion: 0.26
Nodes (13): Room occupancy overlap rules, formatOverlapPeriod(), formatOverlapErrorMessage(), overlapInclude, findHotelChessOverlap(), ensureNoOverlap(), intervalsOverlap(), normalizePlace() (+5 more)

### Community 31 - "Bot Service & Webhooks"
Cohesion: 0.19
Nodes (15): Support chat separated from main chats, buildSenderName(), isUserChatParticipant(), canReceiveChatSubscription(), canReceiveChatReadSubscription(), publishNewUnreadToSupportClients(), newUnreadMessageTopic(), messageReadTopic() (+7 more)

### Community 14 - "Auth: user.resolver, sign-in, refresh tokens"
Cohesion: 0.18
Nodes (19): Access/refresh token lifecycle, buildUserAuthPayload(), normalizeUserLogin(), registerSelfUser(), verifyEmailWithToken(), requestPasswordResetByEmail(), resetPasswordWithToken(), USER_TYPE (+11 more)

### Community 2 - "Data Backfill & Travelline"
Cohesion: 0.06
Nodes (19): TravelLine integration, normalizeAutoSyncHours(), isAutoSyncDue(), timePart(), buildStayDatesWithExtras(), parseVerifyResponse(), toUtcMs(), computeTzOffset() (+11 more)

### Community 37 - "Backend Tech Stack"
Cohesion: 0.11
Nodes (19): Backend tech stack, @apollo/server, @apollo/server, @graphql-tools/merge, @graphql-tools/merge, argon2, argon2, express (+11 more)

### Community 45 - "Prisma Workflow & Scripts"
Cohesion: 0.21
Nodes (18): npm script catalogue, Schema-first Prisma workflow, scripts, backup, start, start2, production, dev (+10 more)

### Community 79 - "Server Entry & Auth Middleware"
Cohesion: 0.33
Nodes (6): Environment variable contract (.env), .env is committed with dev values, .env.docker and .env.example configuration, wsKeepAliveParsed, wsKeepAliveParsed, getCorsOptions()

### Community 11 - "Server Entry & Auth Middleware"
Cohesion: 0.10
Nodes (29): Central typeDef/resolver mergers, mergedResolvers, require, httpServer, httpsServer, schema, serverCleanup, server (+21 more)

### Community 44 - "GraphQL Auth Context"
Cohesion: 0.18
Nodes (14): JWT authentication into GraphQL context, EMPTY_TOKEN_VALUES, AUTH_ERROR_CODES, AuthError, isAuthError(), extractToken(), isLikelyJwt(), raiseAuthError() (+6 more)

### Community 80 - "TOTP Two-factor Auth"
Cohesion: 0.29
Nodes (7): TOTP two-factor authentication, @levminer/speakeasy, @levminer/speakeasy, qrcode, qrcode, speakeasy, speakeasy

### Community 64 - "Bot Service & Webhooks"
Cohesion: 0.17
Nodes (9): Redis-backed pub/sub for multi-instance, @graphql-yoga/redis-event-target, @graphql-yoga/redis-event-target, ioredis, ioredis, pm2, pm2, RedisEventTargetPubSub (+1 more)

### Community 38 - "Package Config & Nodemon"
Cohesion: 0.11
Nodes (19): File and document generation, Nodemon ignores runtime write directories, exceljs, exceljs, graphql-upload, graphql-upload, pdfkit, pdfkit (+11 more)

### Community 16 - "Docker Stack Deployment"
Cohesion: 0.15
Nodes (27): MongoDB ReplicaSet requirement, KarsAvia deployment guide (v3.5.0), Host system requirements, Backend and frontend must be sibling directories, docker compose up --build first-run sequence, Empty database on first deployment, Test SUPERADMIN login credentials (admin/admin123), Docker Compose three-container stack (+19 more)

### Community 30 - "Auth Middleware: role decorators & report resolver"
Cohesion: 0.20
Nodes (18): Role-based middleware decorators, roleMiddleware(), dispatcherModerMiddleware(), superAdminMiddleware(), adminMiddleware(), adminHotelAirMiddleware(), representativeMiddleware(), moderatorMiddleware() (+10 more)

### Community 65 - "Bot Service & Webhooks"
Cohesion: 0.29
Nodes (9): Telegram Support Message Data Flow, Message Persistence Stage (Message record in DB), Real-time Fan-out Stage: pubsub.publish(MESSAGE_SENT), Admin UI Subscription Stage, Admin Reply Stage (sendMessage mutation), Outbound Delivery Stage (bot.sendMessage back to Telegram), chatResolver, wsServer (+1 more)

### Community 19 - "Bot Service & Webhooks"
Cohesion: 0.14
Nodes (8): Incoming Stage: Telegram Bot → Webhook/Polling → handleIncomingMessage, router, BotService, buildTelegramUrl(), buildUserData(), parseTelegramUpdate(), setTelegramWebhook(), deleteTelegramWebhook()

### Community 9 - "Backend Dependencies"
Cohesion: 0.04
Nodes (49): dependencies, @graphql-tools/schema, @graphql-tools/schema, @maxhub/max-bot-api, @maxhub/max-bot-api, archetype, archetype, axios (+41 more)

### Community 12 - "Documentation Tree & Backfill"
Cohesion: 0.09
Nodes (8): prisma, deleteSectionCascade(), getSectionsHierarchyJSONOptimized(), main(), __dirname, defaultJsonPath, calculateMealCost(), DISPATCHER

### Community 3 - "Airline Resolver & Price Geography"
Cohesion: 0.07
Nodes (60): priceValidity(), isWindowedPrice(), syncAirlinePriceGeography(), hasOwn(), syncDepartmentPositionLinks(), airlineResolver, buildAirlineWhere(), normalizeGeoValue() (+52 more)

### Community 55 - "Resolvers: representative, global, city, airport, log, airline"
Cohesion: 0.15
Nodes (12): airportResolver, cityInclude, cityResolver, documentationResolver, externalAuthResolver, hotelResolver, logResolver, reportResolver (+4 more)

### Community 23 - "Contract Resolver & Filters"
Cohesion: 0.16
Nodes (19): contractExpirationFields, agreementExpirationFields, deleteContractAndAgreementFiles(), removeContractFileRecord(), contractResolver, isArchivedContractFilter(), appendArchiveFilter(), buildAdditionalAgreementWhere() (+11 more)

### Community 57 - "Resolvers: representative, global, city, airport, log, airline"
Cohesion: 0.23
Nodes (9): driverResolver, organizationResolver, safeSlug(), ensureDir(), buildUploadPath(), uploadImage(), deleteImage(), dateFormatter() (+1 more)

### Community 46 - "Push Notifications: Firebase tokens & transferPushService"
Cohesion: 0.16
Nodes (14): SUBJECT, resolveAuthSubject(), globalResolver, SUBJECT, getSubjectTokenWhere(), sendToToken(), sendToTokens(), sendNotificationToUser() (+6 more)

### Community 47 - "Airline Resolver & Price Geography"
Cohesion: 0.20
Nodes (12): roomKindSeasonResolver, AIRLINE_PRICE_KEYS, NESTED_LISTS, shouldHideAirlinePrices(), omitAirlineKeys(), omitAirlinePriceWrites(), hiddenAirlinePrice(), hiddenAirlineFlag() (+4 more)

### Community 32 - "Baggage Delivery Normalization"
Cohesion: 0.22
Nodes (17): normalizeBaggageTags(), has(), toMoney(), toWholeCountOrNull(), toTrimmedOrNull(), normalizeDriverPerson(), normalizePeopleForWrite(), normalizeDriversForWrite() (+9 more)

### Community 28 - "Transfer & Baggage Normalizers"
Cohesion: 0.26
Nodes (14): mapDriverAt(), driversServicePatch(), normalizeOptionalString(), normalizeCrewMember(), getTransferField(), getTransferServiceKind(), ensureDriverPerson(), normalizePassengerServiceDriver() (+6 more)

### Community 13 - "FAP Request Envelope: envelope.js & service resolvers"
Cohesion: 0.15
Nodes (23): normalizeBulkIndexes(), spliceAtIndexes(), getSubjectName(), loadRequestOrThrow(), assertIndex(), assertMoment(), assertReason(), reportWhere() (+15 more)

### Community 4 - "FAP Scope & Subscriptions"
Cohesion: 0.06
Nodes (49): viewerIsAirline(), viewerHotelIndexes(), assertAirlineSubject(), allow(), cache, defaultDeps, keyOf(), catalogVehicleNumber() (+41 more)

### Community 74 - "Passenger Request Resolver"
Cohesion: 0.32
Nodes (3): passengerRequestResolver, here, runRaw()

### Community 15 - "Roster & Saved Passengers"
Cohesion: 0.20
Nodes (20): DRY_RUN, DRIVER_SERVICES, main(), normalizeOptionalString(), normalizePersonType(), normalizePersonCategory(), normalizeFullNameKey(), rosterMatchKey() (+12 more)

### Community 51 - "Auth Middleware: role decorators & report resolver"
Cohesion: 0.22
Nodes (10): draftInclude, buildSavedReportListWhere(), isDispatcherUser(), isAirlineOrgUser(), buildReportDraftsWhere(), assertAirlineDraftSubject(), assertCanDeleteSavedReport(), REPORT_EDITABLE_FIELD_KEYS (+2 more)

### Community 48 - "Report Drafts: merge, frozen rows, changedFrom"
Cohesion: 0.24
Nodes (15): buildDraftPresentation(), writeExcelAndSave(), colLetter(), writeStyledWorkbook(), generateExcelAvia(), generateExcelHotel(), formatReportCurrency(), formatCellRaw() (+7 more)

### Community 40 - "Push Notifications: Firebase tokens & transferPushService"
Cohesion: 0.22
Nodes (15): transferResolver, DATE_FIELDS, SUBJECT, STATUS_BROADCAST_SET, recipientKey(), withoutActor(), dedupeRecipients(), sendToRecipients() (+7 more)

### Community 0 - "analytics"
Cohesion: 0.05
Nodes (98): getCategoryPriceFromContract(), roundMoney(), normalizeServices(), fetchRequests(), fetchTransfers(), getRequestBudget(), getServiceRequestBudget(), buildServiceRequestItems() (+90 more)

### Community 25 - "Contract Archiving"
Cohesion: 0.18
Nodes (21): buildExpiredNoProlongationWhere(), applyArchiveData(), applyRestoreData(), performArchiveContract(), performArchiveAgreement(), archiveContractRecordInternal(), restoreContractRecordInternal(), archiveContractRecord() (+13 more)

### Community 52 - "Contract File Management"
Cohesion: 0.26
Nodes (14): deleteContractFileFromDisk(), safeSlug(), ensureDir(), buildUploadPath(), uploadBuffer(), uploadFiles(), resolveAbsoluteFilePath(), deleteFiles() (+6 more)

### Community 33 - "User Presence & Stale Sessions"
Cohesion: 0.21
Nodes (17): archiveOldSavedReports(), isArchivedReportFilter(), isSavedReportArchived(), appendSavedReportArchiveFilter(), buildAutoArchiveWhere(), applyArchiveData(), applyRestoreData(), archiveSavedReport() (+9 more)

### Community 29 - "Auth: user.resolver, sign-in, refresh tokens"
Cohesion: 0.19
Nodes (18): runPresenceCleanup(), startPresenceCleanupJob(), lastTouchByUserId, OFFLINE_USER_SELECT, TOUCH_USER_SELECT, touchLastSeenAsync(), touchLastSeen(), touchLastSeenForContext() (+10 more)

### Community 18 - "Passenger Document Recognition"
Cohesion: 0.14
Nodes (13): EXTRACTION_PROMPT, prepareImage(), collapse(), normalizeFields(), computeConfidence(), EMPTY_RESULT, recognizePassengerDocument(), parseGptJson() (+5 more)

### Community 81 - "Passenger Request Resolver"
Cohesion: 0.38
Nodes (4): createRecognitionRateLimiter(), recognitionRateLimiter, runRaw(), makeEarlyCompletedWater()

### Community 26 - "Passenger Request Emails"
Cohesion: 0.24
Nodes (19): withChatId(), buildRequestCardUrl(), buildPassengerRequestCardUrl(), buildEntityChatUrl(), esc(), span(), spanNo(), requestRelayLinkHtml() (+11 more)

### Community 34 - "Passenger Request Emails"
Cohesion: 0.41
Nodes (18): esc(), span(), spanNo(), formatPassengerRequestLabel(), passengerRequestRelayLinkHtml(), buildCreatePassengerRequestEmail(), buildPassengerRequestDatesChangeEmail(), buildUpdatePassengerRequestEmail() (+10 more)

### Community 36 - "Action Log: logaction.js sanitization"
Cohesion: 0.22
Nodes (19): LARGE_ARRAY_KEYS, isPlainObject(), shouldCompactArrayByKey(), truncateString(), sanitizeLargeFields(), getByPath(), setByPath(), pick() (+11 more)

### Community 56 - "migrations"
Cohesion: 0.18
Nodes (14): DRY_RUN, WHERE, FIELDS, selectReportsToApprove(), approvalDataFor(), moment(), run(), main() (+6 more)

### Community 95 - "Documentation Tree & Backfill"
Cohesion: 0.83
Nodes (3): isObjectId(), parse(), main()

### Community 75 - "Email & Push Notifications"
Cohesion: 0.36
Nodes (7): prisma, ACTION_FIELDS, MENU_OWNERS, isBoolean(), buildNotificationMenuBackfill(), backfillForModel(), main()

### Community 89 - "Documentation Tree & Backfill"
Cohesion: 0.60
Nodes (4): APPLY, composeHotelAddress(), sameString(), main()

### Community 90 - "Data Backfill & Travelline"
Cohesion: 0.80
Nodes (4): resolveDepartmentFromRecord(), backfillRequests(), backfillReserves(), main()

### Community 76 - "One-off Migration Scripts"
Cohesion: 0.36
Nodes (7): DISPATCHER_ROLES, AIRLINE_ROLES, HOTEL_ROLES, KNOWN_ROLES, sample(), countDangling(), main()

### Community 84 - "Data Backfill & Travelline"
Cohesion: 0.53
Nodes (5): APPLY, isOpen(), findLastOpenIndex(), requestLabel(), main()

### Community 91 - "One-off Migration Scripts"
Cohesion: 0.80
Nodes (4): toObjectIdString(), hasLegacyGeography(), fetchLegacyPriceDocs(), main()

### Community 85 - "One-off Migration Scripts"
Cohesion: 0.60
Nodes (5): toObjectIdString(), normalizeRegionName(), fetchCityDocs(), ensureRegionByName(), main()

### Community 72 - "Contract File Migration"
Cohesion: 0.33
Nodes (8): DRY_RUN, TARGETS, LEGACY_FILES_FILTER, hasLegacyFiles(), fetchLegacyDocs(), updateLegacyDoc(), migrateModel(), main()

### Community 41 - "Upload File Migration"
Cohesion: 0.19
Nodes (18): UPLOADS_ROOT, REPORTS_ROOT, REPORT_ROOT, ensureDir(), isTopLevelFile(), getFileDateParts(), buildTargetDir(), normalizeUploadPath() (+10 more)

### Community 68 - "Passenger Request Resolver"
Cohesion: 0.29
Nodes (6): HOTEL_CHESS_LOG_ACTIONS, KARS_FALLBACK_ACTIONS, resolveEmailActionForLog(), getDispatcherFallbackForPassengerEmail(), runRaw(), withBaggage()

### Community 86 - "Passenger Request Mutations"
Cohesion: 0.47
Nodes (3): closesBeforeStart(), closeOpenChess(), AT

### Community 73 - "FAP Access Guards"
Cohesion: 0.44
Nodes (6): ALLOWED_SUBJECT_TYPES, assertFapSubject(), guardResolver(), guardSection(), guardSubscriptions(), withFapAuthGuard()

### Community 82 - "FAP Edit Guard & Request Envelope"
Cohesion: 0.48
Nodes (3): forbidden(), editLockVerdict(), assertRequestEditable()

### Community 77 - "Living Resolver & Hotel Chess"
Cohesion: 0.29
Nodes (3): countLivingPeople(), applyServiceRecalc(), hotels

### Community 61 - "FAP Edit Guard: fapEditGuard, serviceTable, patchIsNoop"
Cohesion: 0.22
Nodes (6): driversFact(), PASSENGER_SERVICE_TABLE, PASSENGER_SERVICE_FIELDS, findPassengerService(), passengerServiceFields(), DRIVER_SERVICES

### Community 24 - "Partial-day Settings Rules"
Cohesion: 0.17
Nodes (21): REQUEST_STATUSES, requestIncludeAirline, requestIncludeHotel, buildAirlineReportData(), buildHotelReportData(), getDefaultPartialDayRules(), parseHhMmToMinutes(), assertValidHhMm() (+13 more)

### Community 42 - "Report Drafts: merge, frozen rows, changedFrom"
Cohesion: 0.25
Nodes (16): normalizeReportDraftRows(), STICKY_ROW_KEYS, valuesEqual(), rowKey(), indexByRequestId(), stripChangedKeys(), changedFromEntry(), detectChangedKeys() (+8 more)

### Community 59 - "Report Drafts: merge, frozen rows, changedFrom"
Cohesion: 0.26
Nodes (11): parseLocalDT(), formatLocal(), findOverlapClusters(), buildShareSegmentsForGuest(), buildShareNoteFromSegments(), buildShareClusterId(), enrichRowsWithShareMetadata(), recomputeReportDraftShareMetadata() (+3 more)

### Community 62 - "Request Resolver & Bulk Import"
Cohesion: 0.28
Nodes (12): HEADER_MATCHERS, normalizeHeader(), mapHeaders(), parseExcelDate(), parseExcelTime(), combineDateAndTime(), normalizeFlightStatus(), parseIntField() (+4 more)

### Community 83 - "Room Share Matrix (report nights)"
Cohesion: 0.57
Nodes (6): parseDDMMYYYY_HHMMSS(), startOfServiceDay(), addDays(), listServiceNights(), toRu(), computeRoomShareMatrix()

### Community 87 - "Auth: user.resolver, sign-in, refresh tokens"
Cohesion: 0.60
Nodes (5): toDayKeyUtc(), dayStartUtcMs(), splitDurationByDay(), mergeDailyStats(), buildClosedSessionStats()

### Community 69 - "Contract Expiration Sorting"
Cohesion: 0.24
Nodes (8): assert(), now, contractWhere, agreementWhere, activeFilter, archivedFilter, createContractModelMock(), createAgreementPrismaMock()

### Community 88 - "Price Geography Normalization Tests"
Cohesion: 0.33
Nodes (5): cityFindUnique, regionFindUnique, regionFindFirst, priceGeoFindMany, airportOnPriceFindMany

### Community 21 - "Passenger Request Resolver"
Cohesion: 0.16
Nodes (13): normalizeSnapshot(), installPubsubSpy(), releasePubsubAfterTests(), runFapMutation(), runRaw(), runRaw(), withTransfer(), runRaw() (+5 more)

### Community 27 - "Passenger Request Resolver"
Cohesion: 0.14
Nodes (19): READ_ONE, READ_MANY, WRITE_ONE, WRITE_MANY, COUNTERS, ALL_METHODS, clone(), modelKeys() (+11 more)

### Community 58 - "Passenger Request Resolver"
Cohesion: 0.20
Nodes (10): completedWater(), runRaw(), legacyGuest(), requestWithLegacyInSecondHotel(), requestWithThreeHotels(), requestWithPlaced(), requestWithGroups(), requestWithScanManifestDupes() (+2 more)

### Community 92 - "Passenger Request Resolver"
Cohesion: 0.60
Nodes (4): runRaw(), makePerson(), requestWithLiving(), bothHotelsPopulated()

### Community 43 - "Passenger Request Resolver"
Cohesion: 0.15
Nodes (10): runList(), runOne(), FLIGHT_DATE_MISSING, makeContext(), makeHotelContext(), stageOf(), runList(), runStageList() (+2 more)

### Community 78 - "Passenger Request Resolver"
Cohesion: 0.32
Nodes (6): runReport(), MAPPED_ROW_FIELDS, saveArgs(), makeSavedReport(), makeApprovedReport(), reportCases()

### Community 93 - "Passenger Request Resolver"
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
- **202 isolated node(s):** `Test SUPERADMIN login credentials (admin/admin123)`, `rl`, `AUTH_ERROR_CODES`, `name`, `main` (+197 more)
  These have ≤1 connection - possible missing edges or undocumented components.
- **3 thin communities (<3 nodes) omitted from report** — run `graphify query` to explore isolated nodes.

## Suggested Questions
_Questions this graph is uniquely positioned to answer:_

- **What is the exact relationship between `Legacy schema migration script` and `airload.js`?**
  _Edge tagged AMBIGUOUS (relation: conceptually_related_to) - confidence is low._
- **What is the exact relationship between `PubSub subscriptions and subscription context` and `corsOptions.js`?**
  _Edge tagged AMBIGUOUS (relation: conceptually_related_to) - confidence is low._
- **What is the exact relationship between `Published ports 3000 and 4000` and `Host Port 4001 → Container 4000 Mapping`?**
  _Edge tagged AMBIGUOUS (relation: conceptually_related_to) - confidence is low._
- **Why does `prisma` connect `Documentation Tree & Backfill` to `analytics`, `Email Notifications: templates, rate guard, menu check`, `Data Backfill & Travelline`, `Airline Resolver & Price Geography`, `FAP Scope & Subscriptions`, `FAP Passenger Analytics & Grouping`, `File Access Routes & Backup`, `Access: assertCanManageAccess.js guards & Travelline role checks`, `External Auth: Magic Links & Hotel Preview`, `System Updates & Maintenance Banner`, `Server Entry & Auth Middleware`, `FAP Request Envelope: envelope.js & service resolvers`, `Auth: user.resolver, sign-in, refresh tokens`, `Roster & Saved Passengers`, `Docker Stack Deployment`, `Merge Saved People (duplicates)`, `Requests: number generation, bulk create & date formatting`, `Contract Resolver & Filters`, `Partial-day Settings Rules`, `Contract Archiving`, `Passenger Request Resolver`, `Transfer & Baggage Normalizers`, `Auth: user.resolver, sign-in, refresh tokens`, `Auth Middleware: role decorators & report resolver`, `Bot Service & Webhooks`, `User Presence & Stale Sessions`, `Passenger Request Emails`, `Bot Service & Webhooks`, `Action Log: logaction.js sanitization`, `Push Notifications: Firebase tokens & transferPushService`, `Upload File Migration`, `GraphQL Auth Context`, `Push Notifications: Firebase tokens & transferPushService`, `Airline Resolver & Price Geography`, `Room Occupancy Overlap`, `Room Occupancy Overlap`, `Auth Middleware: role decorators & report resolver`, `Requests: number generation, bulk create & date formatting`, `Resolvers: representative, global, city, airport, log, airline`, `migrations`, `Resolvers: representative, global, city, airport, log, airline`, `Report Drafts: merge, frozen rows, changedFrom`, `Bot Service & Webhooks`, `Email & Push Notifications`, `Bot Service & Webhooks`, `User Presence & Stale Sessions`, `Contract File Migration`, `One-off Migration Scripts`, `FAP Edit Guard & Request Envelope`, `Data Backfill & Travelline`, `One-off Migration Scripts`, `Documentation Tree & Backfill`, `Data Backfill & Travelline`, `One-off Migration Scripts`, `Documentation Tree & Backfill`?**
  _High betweenness centrality (0.274) - this node is a cross-community bridge._
- **Why does `TravellineService` connect `Data Backfill & Travelline` to `Server Entry & Auth Middleware`, `Requests: number generation, bulk create & date formatting`, `Access: assertCanManageAccess.js guards & Travelline role checks`?**
  _High betweenness centrality (0.060) - this node is a cross-community bridge._
- **Why does `dependencies` connect `Backend Dependencies` to `Bot Service & Webhooks`, `Backend Tech Stack`, `Package Config & Nodemon`, `One-off Migration Scripts`, `TOTP Two-factor Auth`, `Backend Health & Conventions`?**
  _High betweenness centrality (0.059) - this node is a cross-community bridge._
- **Are the 4 inferred relationships involving `prisma` (e.g. with `MongoDB ReplicaSet requirement` and `MongoDB Service (single node, replica set rs0)`) actually correct?**
  _`prisma` has 4 INFERRED edges - model-reasoned connections that need verification._