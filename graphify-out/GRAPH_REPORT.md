# Graph Report - .  (2026-09-07)

## Corpus Check
- 366 files · ~240,451 words
- Verdict: corpus is large enough that graph structure adds value.

## Summary
- 2026 nodes · 5618 edges · 82 communities (80 shown, 2 thin omitted)
- Extraction: 95% EXTRACTED · 5% INFERRED · 0% AMBIGUOUS · INFERRED: 280 edges (avg confidence: 0.84)
- Token cost: 0 input · 0 output

## Community Hubs (Navigation)
- Request & Reserve Module
- Analytics & Request Aggregation
- Server Entry & Auth Middleware
- Transfer Push (Firebase) & transfer.resolver
- Cron Jobs & Backups
- Contract File Management
- Auth: user.resolver, sign-in, refresh tokens
- Price Geography Conflicts
- Documentation Tree & Backfill
- Room Occupancy Overlap
- Email & Push Notifications
- External Auth & File Access
- File Upload & Deletion
- Bulk Request Import
- Backend Health & Conventions
- One-off Migration Scripts
- Winston File Logger
- System Updates & Maintenance Banner
- Passenger Groups & Hotel Items
- Real-time PubSub Subscriptions
- Report XLSX/PDF Exporter
- Support Chat & Documentation
- Data Backfill & Travelline
- Cron Jobs & Backups
- External Auth & File Access
- Backend Tech Stack
- Prisma Workflow & Scripts
- Server Entry & Auth Middleware
- GraphQL Auth Context
- TOTP Two-factor Auth
- Real-time PubSub Subscriptions
- Package Config & Nodemon
- Docker Stack Deployment
- Global Resolvers & Logs
- Bot Service & Webhooks
- Bot Service & Webhooks
- Role-based Auth Middleware
- Backend Dependencies
- Contract Resolver & Filters
- Price Geography Conflicts
- hotel
- Baggage Delivery Normalization
- Passenger Request Mutations
- Passenger Request Mutations
- FAP Scope & Subscriptions
- Passenger Request Resolver
- Transfer & Baggage Normalizers
- report
- Roster & Saved Passengers
- Price Geography Conflicts
- Request Cost Allocation
- Airline Analytics Builders
- Request Pricing Calculation
- Airline Service Comparison
- Analytics & Request Aggregation
- External Auth & File Access
- Contract Archiving
- Contract Resolver & Filters
- Passenger Document Recognition
- Passenger Request Emails
- Access Menu Permissions
- Price Geography Conflicts
- Bulk Request Import & logaction
- migrations
- Contract File Migration
- Upload File Migration
- Chess Helpers
- FAP Access Guards
- FAP Edit Guard & Request Envelope
- File Upload & Deletion
- Living Resolver & Hotel Chess
- Passenger Groups & Hotel Items
- Report Drafts: merge, frozen rows, changedFrom
- Partial-day Settings Rules
- Report Draft & Share Metadata
- Bulk Request Import
- Room Occupancy Overlap
- Cron Jobs & Backups
- Price Search Location Tests
- Contract Expiration Sorting
- Price Geography Normalization Tests

## God Nodes (most connected - your core abstractions)
1. `prisma` - 116 edges
2. `TravellineService` - 50 edges
3. `installPrismaDouble()` - 45 edges
4. `pubsub` - 32 edges
5. `logger` - 31 edges
6. `makeRequest()` - 29 edges
7. `allMiddleware()` - 26 edges
8. `BotService` - 25 edges
9. `installPubsubSpy()` - 25 edges
10. `aggregatePassengerRequest()` - 19 edges

## Surprising Connections (you probably didn't know these)
- `Real-time GraphQL subscriptions` --references--> `wsServer`  [INFERRED]
  CLAUDE.md → server2.js
- `Redis-backed pub/sub for multi-instance` --references--> `@graphql-yoga/redis-event-target`  [INFERRED]
  CLAUDE.md → package.json
- `Redis-backed pub/sub for multi-instance` --references--> `ioredis`  [INFERRED]
  CLAUDE.md → package.json
- `KarsAvia GraphQL Backend (v3.5.0)` --semantically_similar_to--> `Kars Avia GraphQL Backend`  [INFERRED] [semantically similar]
  CLAUDE.md → README.md
- `JWT authentication into GraphQL context` --semantically_similar_to--> `Unified auth middleware`  [INFERRED] [semantically similar]
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

## Communities (82 total, 2 thin omitted)

### Community 44 - "Request & Reserve Module"
Cohesion: 0.17
Nodes (9): Kars Avia GraphQL Backend, Meal plan calculation (MealPlan / DailyMeal), Report engine versioning (v5 to v7), Reserve module, reserveResolver, calculateMeal(), updateDailyMeals(), calculateMealCost() (+1 more)

### Community 13 - "Analytics & Request Aggregation"
Cohesion: 0.10
Nodes (34): Analytics module, analyticsResolver, buildWhereConditionsRequests(), analyticsUserRequests(), createdByPeriodForEntityRequests(), totalCreatedRequests(), totalCancelledRequests(), countRequestsByStatus() (+26 more)

### Community 12 - "Server Entry & Auth Middleware"
Cohesion: 0.09
Nodes (33): Unified auth middleware, Dual entry points (server2.js / server.js), Central typeDef/resolver mergers, isAuthError(), mergedResolvers, require, sslOptions, httpServer (+25 more)

### Community 3 - "Transfer Push (Firebase) & transfer.resolver"
Cohesion: 0.06
Nodes (28): Composite Prisma types (Information, Price, MealPrice, MealPlan), Driver / representative / organization entities, Global shared schema and resolver layer, HotelChess to Room relation via nested connect, Per-domain GraphQL module layout, transferResolver, DATE_FIELDS, SUBJECT (+20 more)

### Community 66 - "Cron Jobs & Backups"
Cohesion: 0.36
Nodes (10): Cron auto-archiving of expired contracts, Request archiving with cron and grace period, Scheduled cron jobs, moveExpiredToArchiving(), finalizeArchivingRequests(), archiveOldSavedReports(), checkAndArchiveRequests(), startArchivingJob() (+2 more)

### Community 61 - "Contract File Management"
Cohesion: 0.33
Nodes (11): Contracts module, deleteContractAndAgreementFiles(), deriveDisplayNameFromPath(), normalizeContractFiles(), extractFileUrls(), validateContractFileUploadInput(), deleteContractFileFromDisk(), deleteAllContractFilesFromDisk() (+3 more)

### Community 1 - "Auth: user.resolver, sign-in, refresh tokens"
Cohesion: 0.05
Nodes (74): Department access control (accessMenu), Access/refresh token lifecycle, Two-factor authentication (speakeasy + QR), AccessMenu feature-flag permissions, requireTravellineSection(), ACCESS_MENU_KEYS, hasOwn(), compactAccessMenu() (+66 more)

### Community 16 - "Price Geography Conflicts"
Cohesion: 0.12
Nodes (33): Dependency hygiene and resource reduction, Pagination and server payload reduction, priceValidity(), isWindowedPrice(), syncAirlinePriceGeography(), hasOwn(), syncDepartmentPositionLinks(), buildAirlineWhere() (+25 more)

### Community 17 - "Documentation Tree & Backfill"
Cohesion: 0.09
Nodes (13): Documentation tree and hierarchy, prisma, deleteSectionCascade(), getSectionsHierarchyJSONOptimized(), isObjectId(), parse(), main(), APPLY (+5 more)

### Community 19 - "Room Occupancy Overlap"
Cohesion: 0.15
Nodes (21): Duplicate request detection, Room categories and tariffs, Hotel room counters and recount, Room occupancy overlap rules, transporter, categoryToPlaces, calculatePlaces(), updateHotelRoomCounts() (+13 more)

### Community 4 - "Email & Push Notifications"
Cohesion: 0.09
Nodes (44): Transactional email delivery, Firebase push notifications, Notification subsystem, Positions (должности) model consolidation, dispatcherOrSuperAdminMiddleware(), TRANSFER_NOTIFICATION_ACTIONS, dispatcherResolver, prisma (+36 more)

### Community 8 - "External Auth & File Access"
Cohesion: 0.10
Nodes (39): External auth via magic link, SUBJECT_TYPE, EXTERNAL_SCOPES, EXTERNAL_ACCESS_TYPES, throwForbidden(), resolveAdminId(), issueTokenForExternalUser(), buildExternalAuthPayload() (+31 more)

### Community 54 - "File Upload & Deletion"
Cohesion: 0.21
Nodes (13): File access control and path normalization, Hotel preview links, hotelPreviewMiddleware(), safeSlug(), ensureDir(), buildUploadPath(), uploadBuffer(), uploadFiles() (+5 more)

### Community 21 - "Bulk Request Import"
Cohesion: 0.14
Nodes (20): Group and bulk requests, Request number generation, removeContractFileRecord(), transporter, reverseDateTimeFormatter(), formatDate(), logAction(), resolveCreatorDepartmentFromSender() (+12 more)

### Community 34 - "Backend Health & Conventions"
Cohesion: 0.12
Nodes (19): GET /health with app version, House rules for writing code, Visual style discipline, Token economy rule, KarsAvia GraphQL Backend (v3.5.0), GET /health liveness endpoint, Post-deploy verification via /health, Backend /health Healthcheck (+11 more)

### Community 24 - "One-off Migration Scripts"
Cohesion: 0.10
Nodes (23): Legacy schema migration script, Upload and backfill migrations, Thin resolvers, fat service layer, One-off migration scripts, prisma, DEFAULT, main(), DISPATCHER_ROLES (+15 more)

### Community 68 - "Winston File Logger"
Cohesion: 0.42
Nodes (9): Logs as a first-class model with pagination, Winston plus monthly-rotation file logger, ensuredDirs, getTimeStamp(), getLogFilePath(), ensureLogDir(), appendLog(), logToFile() (+1 more)

### Community 9 - "System Updates & Maintenance Banner"
Cohesion: 0.11
Nodes (38): Maintenance banner with live subscription, Semver comparison gating for release visibility, System update notifications (SystemUpdate), siteResolver, hasLegacySections(), main(), getMaintenanceBanner(), updateMaintenanceBanner() (+30 more)

### Community 57 - "Passenger Groups & Hotel Items"
Cohesion: 0.26
Nodes (9): Passenger Request module, ensurePassengerServiceHotelItemId(), KINDS, LEVELS, rosterIds(), upsertGroup(), removeGroup(), stripPersonFromGroups() (+1 more)

### Community 31 - "Real-time PubSub Subscriptions"
Cohesion: 0.19
Nodes (17): PubSub subscriptions and subscription context, Real-time GraphQL subscriptions, PubSub topic naming, wsServer, isUserChatParticipant(), canReceiveChatSubscription(), canReceiveChatReadSubscription(), publishNewUnreadToSupportClients() (+9 more)

### Community 35 - "Report XLSX/PDF Exporter"
Cohesion: 0.21
Nodes (16): Report exporter (XLSX styling, sorting, PDF conversion), buildDraftPresentation(), writeExcelAndSave(), colLetter(), writeStyledWorkbook(), generateExcelAvia(), generateExcelHotel(), formatReportCurrency() (+8 more)

### Community 45 - "Support Chat & Documentation"
Cohesion: 0.22
Nodes (14): Support chat separated from main chats, supportResolver, buildDocumentationTree(), sanitizeTreeInput(), dedupe(), fetchSubtreeByRoot(), getDescendantIds(), getAuthUser() (+6 more)

### Community 2 - "Data Backfill & Travelline"
Cohesion: 0.05
Nodes (28): TravelLine integration, resolveDepartmentFromRecord(), backfillRequests(), backfillReserves(), main(), APPLY, isOpen(), findLastOpenIndex() (+20 more)

### Community 28 - "Cron Jobs & Backups"
Cohesion: 0.20
Nodes (18): User presence and last-visit tracking, runPresenceCleanup(), startPresenceCleanupJob(), lastTouchByUserId, OFFLINE_USER_SELECT, TOUCH_USER_SELECT, touchLastSeenAsync(), touchLastSeen() (+10 more)

### Community 10 - "External Auth & File Access"
Cohesion: 0.09
Nodes (36): Secure File Access System, Automatic File Path Normalization (/uploads → /files/uploads), File Path Field Resolvers (Request.files, Hotel.images, ReportFile.url, …), JWT Bearer Authorization for File Downloads, File Access Rules by Role, Dual Path Format Backward Compatibility, Protected /files/* Route, Storage Roots (uploads, reports, reserve_files) (+28 more)

### Community 27 - "Backend Tech Stack"
Cohesion: 0.08
Nodes (24): Backend tech stack, generated/client is not hand-editable, @apollo/server, @apollo/server, @graphql-tools/merge, @graphql-tools/merge, @prisma/client, @prisma/client (+16 more)

### Community 43 - "Prisma Workflow & Scripts"
Cohesion: 0.21
Nodes (18): npm script catalogue, Schema-first Prisma workflow, scripts, backup, start, start2, production, dev (+10 more)

### Community 67 - "Server Entry & Auth Middleware"
Cohesion: 0.24
Nodes (8): Environment variable contract (.env), .env is committed with dev values, .env.docker and .env.example configuration, wsKeepAliveParsed, wsKeepAliveParsed, __filename, __dirname, serviceAccountPath

### Community 52 - "GraphQL Auth Context"
Cohesion: 0.21
Nodes (12): JWT authentication into GraphQL context, EMPTY_TOKEN_VALUES, AUTH_ERROR_CODES, AuthError, extractToken(), isLikelyJwt(), raiseAuthError(), buildAuthContext() (+4 more)

### Community 72 - "TOTP Two-factor Auth"
Cohesion: 0.29
Nodes (7): TOTP two-factor authentication, @levminer/speakeasy, @levminer/speakeasy, qrcode, qrcode, speakeasy, speakeasy

### Community 56 - "Real-time PubSub Subscriptions"
Cohesion: 0.22
Nodes (10): Redis-backed pub/sub for multi-instance, Telegram Support Message Data Flow, Message Persistence Stage (Message record in DB), Real-time Fan-out Stage: pubsub.publish(MESSAGE_SENT), Admin UI Subscription Stage, Admin Reply Stage (sendMessage mutation), Outbound Delivery Stage (bot.sendMessage back to Telegram), chatResolver (+2 more)

### Community 39 - "Package Config & Nodemon"
Cohesion: 0.11
Nodes (19): File and document generation, Nodemon ignores runtime write directories, exceljs, exceljs, graphql-upload, graphql-upload, pdfkit, pdfkit (+11 more)

### Community 20 - "Docker Stack Deployment"
Cohesion: 0.15
Nodes (27): MongoDB ReplicaSet requirement, KarsAvia deployment guide (v3.5.0), Host system requirements, Backend and frontend must be sibling directories, docker compose up --build first-run sequence, Empty database on first deployment, Test SUPERADMIN login credentials (admin/admin123), Docker Compose three-container stack (+19 more)

### Community 11 - "Global Resolvers & Logs"
Cohesion: 0.09
Nodes (29): Role-based middleware decorators, roleMiddleware(), dispatcherModerMiddleware(), superAdminMiddleware(), adminMiddleware(), adminHotelAirMiddleware(), representativeMiddleware(), moderatorMiddleware() (+21 more)

### Community 65 - "Bot Service & Webhooks"
Cohesion: 0.35
Nodes (8): router, buildSenderName(), buildTelegramUrl(), buildUserData(), parseTelegramUpdate(), sendTelegramMessage(), setTelegramWebhook(), deleteTelegramWebhook()

### Community 40 - "Role-based Auth Middleware"
Cohesion: 0.20
Nodes (12): hotelAdminMiddleware(), airlineAdminMiddleware(), draftInclude, assertDraftAccess(), assertSavedReportAccess(), reportResolver, isDispatcherUser(), isAirlineOrgUser() (+4 more)

### Community 6 - "Backend Dependencies"
Cohesion: 0.04
Nodes (53): dependencies, @graphql-tools/schema, @graphql-tools/schema, @graphql-yoga/redis-event-target, @graphql-yoga/redis-event-target, @maxhub/max-bot-api, @maxhub/max-bot-api, archetype (+45 more)

### Community 48 - "Contract Resolver & Filters"
Cohesion: 0.21
Nodes (14): contractExpirationFields, agreementExpirationFields, appendUploadedContractFiles(), contractResolver, isArchivedContractFilter(), appendArchiveFilter(), buildAdditionalAgreementWhere(), buildAirlineContractWhere() (+6 more)

### Community 49 - "Price Geography Conflicts"
Cohesion: 0.20
Nodes (10): driverResolver, organizationResolver, safeSlug(), ensureDir(), buildUploadPath(), uploadImage(), deleteImage(), dateFormatter() (+2 more)

### Community 50 - "hotel"
Cohesion: 0.22
Nodes (11): AIRLINE_PRICE_KEYS, NESTED_LISTS, shouldHideAirlinePrices(), omitAirlineKeys(), omitAirlinePriceWrites(), hiddenAirlinePrice(), hiddenAirlineFlag(), isPrismaError() (+3 more)

### Community 36 - "Baggage Delivery Normalization"
Cohesion: 0.24
Nodes (16): normalizeBaggageTags(), has(), toMoney(), toWholeCountOrNull(), toTrimmedOrNull(), normalizeDriverPerson(), normalizePeopleForWrite(), normalizeDriversForWrite() (+8 more)

### Community 46 - "Passenger Request Mutations"
Cohesion: 0.18
Nodes (8): stable(), patchIsNoop(), driversFact(), PASSENGER_SERVICE_TABLE, PASSENGER_SERVICE_FIELDS, findPassengerService(), resolveUserId(), DRIVER_SERVICES

### Community 18 - "Passenger Request Mutations"
Cohesion: 0.17
Nodes (17): normalizeBulkIndexes(), spliceAtIndexes(), getSubjectName(), loadRequestOrThrow(), assertIndex(), assertMoment(), assertReason(), reportWhere() (+9 more)

### Community 5 - "FAP Scope & Subscriptions"
Cohesion: 0.07
Nodes (38): viewerIsAirline(), viewerHotelIndexes(), allow(), cache, defaultDeps, keyOf(), catalogVehicleNumber(), resetCatalogVehicleCache() (+30 more)

### Community 0 - "Passenger Request Resolver"
Cohesion: 0.05
Nodes (70): passengerRequestResolver, createRecognitionRateLimiter(), recognitionRateLimiter, disconnectPubSubRedis(), HOTEL_CHESS_LOG_ACTIONS, KARS_FALLBACK_ACTIONS, resolveEmailActionForLog(), getDispatcherFallbackForPassengerEmail() (+62 more)

### Community 37 - "Transfer & Baggage Normalizers"
Cohesion: 0.27
Nodes (13): mapDriverAt(), driversServicePatch(), normalizeOptionalString(), normalizeCrewMember(), getTransferField(), getTransferServiceKind(), ensureDriverPerson(), normalizePassengerServiceDriver() (+5 more)

### Community 32 - "report"
Cohesion: 0.20
Nodes (17): buildSavedReportListWhere(), isArchivedReportFilter(), isSavedReportArchived(), appendSavedReportArchiveFilter(), applyArchiveData(), applyRestoreData(), archiveSavedReport(), restoreSavedReport() (+9 more)

### Community 25 - "Roster & Saved Passengers"
Cohesion: 0.21
Nodes (20): DRY_RUN, DRIVER_SERVICES, main(), normalizeOptionalString(), normalizePersonType(), normalizePersonCategory(), normalizeFullNameKey(), rosterMatchKey() (+12 more)

### Community 41 - "Price Geography Conflicts"
Cohesion: 0.25
Nodes (17): normalizeGeoValue(), hasGeoValue(), getHotelLocation(), applyCityRecord(), buildPriceSearchLocation(), getPriceGeographies(), sortByCreatedAtAsc(), pickFirst() (+9 more)

### Community 53 - "Request Cost Allocation"
Cohesion: 0.16
Nodes (13): getCategoryPriceFromContract(), isArchivedRequestForPricing(), getBaseHotelPricePerDay(), TECH_POS, NOT_TECH_POS, getAirlinePriceForCategory(), isHotelBreakfastIncluded(), calculateTotalDays() (+5 more)

### Community 26 - "Airline Analytics Builders"
Cohesion: 0.20
Nodes (24): roundMoney(), normalizeServices(), fetchRequests(), fetchTransfers(), getRequestBudget(), getServiceRequestBudget(), buildServiceRequestItems(), buildServiceAirportsFromRequests() (+16 more)

### Community 7 - "Request Pricing Calculation"
Cohesion: 0.12
Nodes (45): ACTIVE_STATUSES, roundMoney(), createAllocationKey(), getVehicleType(), computeTransferSpend(), computeTransferBudgetDetails(), computeRequestCosts(), buildRequestRowForAllocation() (+37 more)

### Community 62 - "Airline Service Comparison"
Cohesion: 0.29
Nodes (11): assertDate(), validateRange(), normalizeServices(), normalizeRegions(), buildCrewWhere(), pct(), roundMoney(), getRegionToAirportIds() (+3 more)

### Community 14 - "Analytics & Request Aggregation"
Cohesion: 0.11
Nodes (34): PASSENGER_ANALYTICS_INCLUDE, computePassengerAnalytics(), TRANSFER_FIELDS, roundMoney(), sumHotelReportsCost(), sumTransferCost(), extractHotelNames(), countRequestPeople() (+26 more)

### Community 47 - "External Auth & File Access"
Cohesion: 0.21
Nodes (12): issueExternalLinksForUser(), buildRepresentativeExternalKey(), generateHotelLinks(), generateDriverLink(), reissueShiftedDriverLinks(), generateRepresentativeLinksForRequest(), newDriverId(), ensureDriverIds() (+4 more)

### Community 30 - "Contract Archiving"
Cohesion: 0.19
Nodes (20): buildExpiredNoProlongationWhere(), applyArchiveData(), applyRestoreData(), performArchiveContract(), performArchiveAgreement(), archiveContractRecordInternal(), restoreContractRecordInternal(), archiveContractRecord() (+12 more)

### Community 76 - "Contract Resolver & Filters"
Cohesion: 0.60
Nodes (5): startOfUtcDay(), addUtcMonths(), getContractExpirationMeta(), compareContractsByExpiration(), sortContractsByExpiration()

### Community 22 - "Passenger Document Recognition"
Cohesion: 0.14
Nodes (13): EXTRACTION_PROMPT, prepareImage(), collapse(), normalizeFields(), computeConfidence(), EMPTY_RESULT, recognizePassengerDocument(), parseGptJson() (+5 more)

### Community 15 - "Passenger Request Emails"
Cohesion: 0.16
Nodes (33): withChatId(), buildRequestCardUrl(), buildPassengerRequestCardUrl(), buildEntityChatUrl(), esc(), span(), spanNo(), formatPassengerRequestLabel() (+25 more)

### Community 33 - "Access Menu Permissions"
Cohesion: 0.22
Nodes (14): esc(), span(), spanNo(), buildSupportChatUrl(), supportChatLinkHtml(), buildSupportClientMessageEmail(), emailSentAt, normalizePart() (+6 more)

### Community 58 - "Price Geography Conflicts"
Cohesion: 0.42
Nodes (12): toDayUtc(), addDaysUtc(), listStayNights(), seasonsOverlap(), assertValidSeasonRange(), assertNoSeasonOverlap(), findSeasonForNight(), resolvePriceForNight() (+4 more)

### Community 38 - "Bulk Request Import & logaction"
Cohesion: 0.22
Nodes (19): LARGE_ARRAY_KEYS, isPlainObject(), shouldCompactArrayByKey(), truncateString(), sanitizeLargeFields(), getByPath(), setByPath(), pick() (+11 more)

### Community 55 - "migrations"
Cohesion: 0.20
Nodes (13): DRY_RUN, WHERE, FIELDS, selectReportsToApprove(), approvalDataFor(), moment(), run(), main() (+5 more)

### Community 70 - "Contract File Migration"
Cohesion: 0.33
Nodes (8): DRY_RUN, TARGETS, LEGACY_FILES_FILTER, hasLegacyFiles(), fetchLegacyDocs(), updateLegacyDoc(), migrateModel(), main()

### Community 42 - "Upload File Migration"
Cohesion: 0.19
Nodes (18): UPLOADS_ROOT, REPORTS_ROOT, REPORT_ROOT, ensureDir(), isTopLevelFile(), getFileDateParts(), buildTargetDir(), normalizeUploadPath() (+10 more)

### Community 77 - "Chess Helpers"
Cohesion: 0.47
Nodes (3): closesBeforeStart(), closeOpenChess(), AT

### Community 71 - "FAP Access Guards"
Cohesion: 0.44
Nodes (6): ALLOWED_SUBJECT_TYPES, assertFapSubject(), guardResolver(), guardSection(), guardSubscriptions(), withFapAuthGuard()

### Community 73 - "FAP Edit Guard & Request Envelope"
Cohesion: 0.48
Nodes (3): forbidden(), editLockVerdict(), assertRequestEditable()

### Community 74 - "File Upload & Deletion"
Cohesion: 0.57
Nodes (5): canonicalFilePath(), filePathsMatch(), deletePassengerRequestFileFromDisk(), deleteAllPassengerRequestFilesFromDisk(), findPassengerRequestFileIndex()

### Community 51 - "Living Resolver & Hotel Chess"
Cohesion: 0.18
Nodes (10): countLivingPeople(), withHotelPeople(), applyServiceRecalc(), notifyHotelOverbookIfCrossed(), ensureAccommodationChesses(), ensureHotelPerson(), flightDateTimeMs(), passengerRequestFlightDateChanged() (+2 more)

### Community 63 - "Passenger Groups & Hotel Items"
Cohesion: 0.33
Nodes (11): DRIVER_FIELDS, normalizeOptionalString(), badInput(), remapId(), rebindPeopleList(), rebindDriverService(), remapGroupMemberIds(), fillKeepFromDrops() (+3 more)

### Community 23 - "Report Drafts: merge, frozen rows, changedFrom"
Cohesion: 0.17
Nodes (24): REQUEST_STATUSES, requestIncludeAirline, requestIncludeHotel, buildAirlineReportData(), buildHotelReportData(), normalizeReportDraftRows(), STICKY_ROW_KEYS, valuesEqual() (+16 more)

### Community 59 - "Partial-day Settings Rules"
Cohesion: 0.29
Nodes (12): getDefaultPartialDayRules(), parseHhMmToMinutes(), assertValidHhMm(), settingToRules(), rulesToCalcConfig(), ensureGlobalPartialDaySetting(), resolvePartialDayRules(), validateLevelEntity() (+4 more)

### Community 60 - "Report Draft & Share Metadata"
Cohesion: 0.26
Nodes (11): parseLocalDT(), formatLocal(), findOverlapClusters(), buildShareSegmentsForGuest(), buildShareNoteFromSegments(), buildShareClusterId(), enrichRowsWithShareMetadata(), recomputeReportDraftShareMetadata() (+3 more)

### Community 64 - "Bulk Request Import"
Cohesion: 0.28
Nodes (12): HEADER_MATCHERS, normalizeHeader(), mapHeaders(), parseExcelDate(), parseExcelTime(), combineDateAndTime(), normalizeFlightStatus(), parseIntField() (+4 more)

### Community 75 - "Room Occupancy Overlap"
Cohesion: 0.57
Nodes (6): parseDDMMYYYY_HHMMSS(), startOfServiceDay(), addDays(), listServiceNights(), toRu(), computeRoomShareMatrix()

### Community 78 - "Cron Jobs & Backups"
Cohesion: 0.60
Nodes (5): toDayKeyUtc(), dayStartUtcMs(), splitDurationByDay(), mergeDailyStats(), buildClosedSessionStats()

### Community 69 - "Contract Expiration Sorting"
Cohesion: 0.24
Nodes (8): assert(), now, contractWhere, agreementWhere, activeFilter, archivedFilter, createContractModelMock(), createAgreementPrismaMock()

### Community 79 - "Price Geography Normalization Tests"
Cohesion: 0.33
Nodes (5): cityFindUnique, regionFindUnique, regionFindFirst, priceGeoFindMany, airportOnPriceFindMany

## Ambiguous Edges - Review These
- `Legacy schema migration script` → `airload.js`  [AMBIGUOUS]
  README.md · relation: conceptually_related_to
- `PubSub subscriptions and subscription context` → `corsOptions.js`  [AMBIGUOUS]
  README.md · relation: conceptually_related_to
- `Published ports 3000 and 4000` → `Host Port 4001 → Container 4000 Mapping`  [AMBIGUOUS]
  INSTALL.md · relation: conceptually_related_to

## Knowledge Gaps
- **195 isolated node(s):** `Test SUPERADMIN login credentials (admin/admin123)`, `rl`, `AUTH_ERROR_CODES`, `name`, `main` (+190 more)
  These have ≤1 connection - possible missing edges or undocumented components.
- **2 thin communities (<3 nodes) omitted from report** — run `graphify query` to explore isolated nodes.

## Suggested Questions
_Questions this graph is uniquely positioned to answer:_

- **What is the exact relationship between `Legacy schema migration script` and `airload.js`?**
  _Edge tagged AMBIGUOUS (relation: conceptually_related_to) - confidence is low._
- **What is the exact relationship between `PubSub subscriptions and subscription context` and `corsOptions.js`?**
  _Edge tagged AMBIGUOUS (relation: conceptually_related_to) - confidence is low._
- **What is the exact relationship between `Published ports 3000 and 4000` and `Host Port 4001 → Container 4000 Mapping`?**
  _Edge tagged AMBIGUOUS (relation: conceptually_related_to) - confidence is low._
- **Why does `prisma` connect `Documentation Tree & Backfill` to `Passenger Request Resolver`, `Auth: user.resolver, sign-in, refresh tokens`, `Data Backfill & Travelline`, `Transfer Push (Firebase) & transfer.resolver`, `Email & Push Notifications`, `FAP Scope & Subscriptions`, `Request Pricing Calculation`, `External Auth & File Access`, `System Updates & Maintenance Banner`, `External Auth & File Access`, `Global Resolvers & Logs`, `Server Entry & Auth Middleware`, `Analytics & Request Aggregation`, `Analytics & Request Aggregation`, `Passenger Request Emails`, `Price Geography Conflicts`, `Passenger Request Mutations`, `Room Occupancy Overlap`, `Docker Stack Deployment`, `Bulk Request Import`, `Report Drafts: merge, frozen rows, changedFrom`, `One-off Migration Scripts`, `Roster & Saved Passengers`, `Airline Analytics Builders`, `Cron Jobs & Backups`, `Contract Archiving`, `Real-time PubSub Subscriptions`, `report`, `Access Menu Permissions`, `Bulk Request Import & logaction`, `Role-based Auth Middleware`, `Price Geography Conflicts`, `Upload File Migration`, `Request & Reserve Module`, `Support Chat & Documentation`, `Passenger Request Mutations`, `External Auth & File Access`, `Contract Resolver & Filters`, `Price Geography Conflicts`, `hotel`, `Living Resolver & Hotel Chess`, `GraphQL Auth Context`, `File Upload & Deletion`, `migrations`, `Real-time PubSub Subscriptions`, `Passenger Groups & Hotel Items`, `Partial-day Settings Rules`, `Report Draft & Share Metadata`, `Airline Service Comparison`, `Bot Service & Webhooks`, `Cron Jobs & Backups`, `Contract File Migration`, `FAP Edit Guard & Request Envelope`?**
  _High betweenness centrality (0.267) - this node is a cross-community bridge._
- **Why does `dependencies` connect `Backend Dependencies` to `TOTP Two-factor Auth`, `Backend Health & Conventions`, `Backend Tech Stack`, `Package Config & Nodemon`?**
  _High betweenness centrality (0.096) - this node is a cross-community bridge._
- **Why does `TravellineService` connect `Data Backfill & Travelline` to `Global Resolvers & Logs`, `Server Entry & Auth Middleware`, `Bulk Request Import`?**
  _High betweenness centrality (0.032) - this node is a cross-community bridge._
- **Are the 4 inferred relationships involving `prisma` (e.g. with `MongoDB ReplicaSet requirement` and `MongoDB Service (single node, replica set rs0)`) actually correct?**
  _`prisma` has 4 INFERRED edges - model-reasoned connections that need verification._