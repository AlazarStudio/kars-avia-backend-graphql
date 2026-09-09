# Graph Report - .  (2026-09-09)

## Corpus Check
- 368 files · ~243,303 words
- Verdict: corpus is large enough that graph structure adds value.

## Summary
- 2041 nodes · 5662 edges · 88 communities (82 shown, 6 thin omitted)
- Extraction: 95% EXTRACTED · 5% INFERRED · 0% AMBIGUOUS · INFERRED: 280 edges (avg confidence: 0.84)
- Token cost: 0 input · 0 output

## Community Hubs (Navigation)
- Transfer Push (Firebase) & transfer.resolver
- Analytics: Dispatcher Performance & Stay Summary
- File Access Routes & Backup
- User Presence & Stale Sessions
- Contract File Management
- Access Menu Keys & Effective Access
- External Auth: Magic Links & Hotel Preview
- Documentation Tree & Backfill
- Global Resolvers & Logs
- Email Notifications: templates, rate guard, menu check
- External Auth: Magic Links & Hotel Preview
- File Access Routes & Backup
- Request Resolver & Bulk Import
- Backend Health & Conventions
- One-off Migration Scripts
- Winston File Logger
- System Updates & Maintenance Banner
- FAP Scope & Subscriptions
- Real-time PubSub Subscriptions
- Report Drafts: merge, frozen rows, changedFrom
- Room Occupancy Overlap
- Auth: user.resolver, sign-in, refresh tokens
- Auth: user.resolver, sign-in, refresh tokens
- Prisma Workflow & Scripts
- Backend Tech Stack
- Server Entry & Auth Middleware
- TOTP Two-factor Auth
- Support Chat Data Flow (doc stages)
- Docker Stack Deployment
- Bot Service & Webhooks
- GraphQL Auth Context
- Email & Push Notifications
- Package Config & Nodemon
- Backend Dependencies
- Backend Dependencies
- Backend Dependencies
- Backend Dependencies
- Backend Dependencies
- Backend Dependencies
- Airline Resolver & Price Geography
- Global Resolvers & Logs
- Contract Resolver & Filters
- Driver & Organization Resolvers, uploadImage
- hotel
- Baggage Delivery Normalization
- FAP Edit Guard & Request Envelope
- Passenger Request Core Resolver & Service Table
- FAP Scope & Subscriptions
- Living Resolver & Hotel Chess
- Passenger Request Mutations
- Passenger Request Resolver
- Merge Saved People (duplicates)
- Transfer & Baggage Normalizers
- Bulk Request Import & logaction
- Auth: user.resolver, sign-in, refresh tokens
- Roster & Saved Passengers
- request
- Price Lookup by Hotel Location
- Request Pricing Calculation
- Airline Analytics Builders
- Airline Service Comparison
- Analytics: Dispatcher Performance & Stay Summary
- FAP Passenger Analytics & Grouping
- Analytics: Dispatcher Performance & Stay Summary
- Passenger Request Emails
- Auth: user.resolver, sign-in, refresh tokens
- Contract Archiving
- Contract Expiration Sorting
- File Upload & Deletion
- Passenger Document Recognition
- Room Kind Season Pricing
- migrations
- Email & Push Notifications
- Data Backfill & Travelline
- One-off Migration Scripts
- One-off Migration Scripts
- One-off Migration Scripts
- Contract File Migration
- Upload File Migration
- FAP Scope & Subscriptions
- FAP Access Guards
- Partial-day Settings Rules
- Request Pricing Calculation
- Room Share Matrix (report nights)
- Price Search Location Tests
- Price Geography Normalization Tests
- FAP Scope & Subscriptions

## God Nodes (most connected - your core abstractions)
1. `prisma` - 117 edges
2. `TravellineService` - 50 edges
3. `installPrismaDouble()` - 46 edges
4. `pubsub` - 32 edges
5. `logger` - 31 edges
6. `makeRequest()` - 29 edges
7. `allMiddleware()` - 26 edges
8. `BotService` - 25 edges
9. `installPubsubSpy()` - 25 edges
10. `aggregatePassengerRequest()` - 19 edges

## Surprising Connections (you probably didn't know these)
- `Meal plan calculation (MealPlan / DailyMeal)` --shares_data_with--> `calculateMealCost()`  [INFERRED]
  README.md → services/report/reports.js
- `Environment variable contract (.env)` --references--> `serviceAccountPath`  [INFERRED]
  CLAUDE.md → src/lib/firebaseAdmin.js
- `Real-time GraphQL subscriptions` --references--> `wsServer`  [INFERRED]
  CLAUDE.md → server2.js
- `KarsAvia GraphQL Backend (v3.5.0)` --semantically_similar_to--> `Kars Avia GraphQL Backend`  [INFERRED] [semantically similar]
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

## Communities (88 total, 6 thin omitted)

### Community 16 - "Transfer Push (Firebase) & transfer.resolver"
Cohesion: 0.08
Nodes (11): Kars Avia GraphQL Backend, Composite Prisma types (Information, Price, MealPrice, MealPlan), Driver / representative / organization entities, Global shared schema and resolver layer, HotelChess to Room relation via nested connect, Positions (должности) model consolidation, Report engine versioning (v5 to v7), Room categories and tariffs (+3 more)

### Community 45 - "Analytics: Dispatcher Performance & Stay Summary"
Cohesion: 0.21
Nodes (14): Analytics module, analyticsResolver, buildWhereConditionsRequests(), analyticsUserRequests(), createdByPeriodForEntityRequests(), totalCreatedRequests(), totalCancelledRequests(), countRequestsByStatus() (+6 more)

### Community 62 - "File Access Routes & Backup"
Cohesion: 0.29
Nodes (11): Unified auth middleware, File Access Rules by Role, JWT authentication into GraphQL context, JWT-protected /files/* route, Host-mounted runtime directories, normalizeRelativePath(), isSuperadminOrDispatcherUser(), checkReportFileAccess() (+3 more)

### Community 2 - "User Presence & Stale Sessions"
Cohesion: 0.06
Nodes (58): Cron auto-archiving of expired contracts, Request archiving with cron and grace period, User presence and last-visit tracking, Scheduled cron jobs, rl, showMenu(), handleUserInput(), node-cron (+50 more)

### Community 61 - "Contract File Management"
Cohesion: 0.35
Nodes (11): Contracts module, appendUploadedContractFiles(), deriveDisplayNameFromPath(), normalizeContractFiles(), extractFileUrls(), validateContractFileUploadInput(), uploadContractFiles(), findContractFileIndex() (+3 more)

### Community 59 - "Access Menu Keys & Effective Access"
Cohesion: 0.32
Nodes (8): Department access control (accessMenu), AccessMenu feature-flag permissions, ACCESS_MENU_KEYS, hasOwn(), hasOwn(), mergeAccessMenus(), resolveEffectiveAccessMenu(), here

### Community 22 - "External Auth: Magic Links & Hotel Preview"
Cohesion: 0.12
Nodes (22): Dependency hygiene and resource reduction, Hotel preview links, Pagination and server payload reduction, hotelPreviewMiddleware(), transporter, sepVariants(), buildHotelWhere(), normalizeBaseUrl() (+14 more)

### Community 12 - "Documentation Tree & Backfill"
Cohesion: 0.08
Nodes (14): Documentation tree and hierarchy, prisma, deleteSectionCascade(), getSectionsHierarchyJSONOptimized(), isObjectId(), parse(), main(), APPLY (+6 more)

### Community 10 - "Global Resolvers & Logs"
Cohesion: 0.11
Nodes (30): Duplicate request detection, Meal plan calculation (MealPlan / DailyMeal), Reserve module, Role-based middleware decorators, roleMiddleware(), dispatcherModerMiddleware(), superAdminMiddleware(), adminMiddleware() (+22 more)

### Community 4 - "Email Notifications: templates, rate guard, menu check"
Cohesion: 0.10
Nodes (42): Transactional email delivery, Firebase push notifications, Notification subsystem, esc(), span(), spanNo(), buildSupportChatUrl(), supportChatLinkHtml() (+34 more)

### Community 5 - "External Auth: Magic Links & Hotel Preview"
Cohesion: 0.09
Nodes (40): External auth via magic link, SUBJECT_TYPE, EXTERNAL_SCOPES, EXTERNAL_ACCESS_TYPES, throwForbidden(), resolveAdminId(), issueTokenForExternalUser(), buildExternalAuthPayload() (+32 more)

### Community 19 - "File Access Routes & Backup"
Cohesion: 0.10
Nodes (29): File access control and path normalization, Secure File Access System, Automatic File Path Normalization (/uploads → /files/uploads), File Path Field Resolvers (Request.files, Hotel.images, ReportFile.url, …), JWT Bearer Authorization for File Downloads, Dual Path Format Backward Compatibility, Protected /files/* Route, Storage Roots (uploads, reports, reserve_files) (+21 more)

### Community 15 - "Request Resolver & Bulk Import"
Cohesion: 0.10
Nodes (33): Group and bulk requests, Request number generation, assertNoExistingLinkNumbers(), normalizeMealPlan(), createSingleBulkRequest(), importBulkRequestsFromFile(), HEADER_MATCHERS, normalizeHeader() (+25 more)

### Community 63 - "Backend Health & Conventions"
Cohesion: 0.21
Nodes (12): GET /health with app version, House rules for writing code, Visual style discipline, Token economy rule, KarsAvia GraphQL Backend (v3.5.0), GET /health liveness endpoint, Post-deploy verification via /health, Backend /health Healthcheck (+4 more)

### Community 69 - "One-off Migration Scripts"
Cohesion: 0.25
Nodes (8): Legacy schema migration script, Upload and backfill migrations, Thin resolvers, fat service layer, One-off migration scripts, @prisma/client, prisma, DEFAULT, main()

### Community 64 - "Winston File Logger"
Cohesion: 0.32
Nodes (11): Logs as a first-class model with pagination, Winston plus monthly-rotation file logger, winston, winston, ensuredDirs, getTimeStamp(), getLogFilePath(), ensureLogDir() (+3 more)

### Community 7 - "System Updates & Maintenance Banner"
Cohesion: 0.11
Nodes (38): Maintenance banner with live subscription, Semver comparison gating for release visibility, System update notifications (SystemUpdate), siteResolver, hasLegacySections(), main(), getMaintenanceBanner(), updateMaintenanceBanner() (+30 more)

### Community 68 - "FAP Scope & Subscriptions"
Cohesion: 0.33
Nodes (6): Passenger Request module, publishPassengerRequestUpdated(), ensurePassengerServiceHotelItemId(), overlayIdentity(), hydrateDriverService(), hydratePassengerRequest()

### Community 14 - "Real-time PubSub Subscriptions"
Cohesion: 0.12
Nodes (27): PubSub subscriptions and subscription context, Real-time GraphQL subscriptions, PubSub topic naming, isUserChatParticipant(), canReceiveChatSubscription(), canReceiveChatReadSubscription(), publishNewUnreadToSupportClients(), logger (+19 more)

### Community 3 - "Report Drafts: merge, frozen rows, changedFrom"
Cohesion: 0.06
Nodes (52): Report exporter (XLSX styling, sorting, PDF conversion), buildDraftPresentation(), draftInclude, buildSavedReportListWhere(), writeExcelAndSave(), normalizeReportDraftRows(), colLetter(), writeStyledWorkbook() (+44 more)

### Community 42 - "Room Occupancy Overlap"
Cohesion: 0.24
Nodes (14): Hotel room counters and recount, Room occupancy overlap rules, formatOverlapPeriod(), formatOverlapErrorMessage(), overlapInclude, findHotelChessOverlap(), ensureNoOverlap(), intervalsOverlap() (+6 more)

### Community 26 - "Auth: user.resolver, sign-in, refresh tokens"
Cohesion: 0.19
Nodes (18): Access/refresh token lifecycle, buildUserAuthPayload(), registerSelfUser(), verifyEmailWithToken(), requestPasswordResetByEmail(), resetPasswordWithToken(), USER_TYPE, ROLE (+10 more)

### Community 38 - "Auth: user.resolver, sign-in, refresh tokens"
Cohesion: 0.26
Nodes (14): Two-factor authentication (speakeasy + QR), getSupportEmail(), getServiceName(), esc(), buildRegistrationVerifyEmail(), buildPasswordResetEmail(), buildPasswordChangedEmail(), buildAccountCreatedByAdminEmail() (+6 more)

### Community 32 - "Prisma Workflow & Scripts"
Cohesion: 0.15
Nodes (23): Dual entry points (server2.js / server.js), npm script catalogue, Schema-first Prisma workflow, generated/client is not hand-editable, Nodemon ignores runtime write directories, scripts, backup, start (+15 more)

### Community 37 - "Backend Tech Stack"
Cohesion: 0.11
Nodes (21): Backend tech stack, Browser → React SPA → GraphQL API → MongoDB flow, @apollo/server, @apollo/server, @graphql-tools/merge, @graphql-tools/merge, @prisma/client, argon2 (+13 more)

### Community 9 - "Server Entry & Auth Middleware"
Cohesion: 0.08
Nodes (35): Environment variable contract (.env), Central typeDef/resolver mergers, .env is committed with dev values, .env.docker and .env.example configuration, mergedResolvers, require, httpServer, httpsServer (+27 more)

### Community 75 - "TOTP Two-factor Auth"
Cohesion: 0.29
Nodes (7): TOTP two-factor authentication, @levminer/speakeasy, @levminer/speakeasy, qrcode, qrcode, speakeasy, speakeasy

### Community 60 - "Support Chat Data Flow (doc stages)"
Cohesion: 0.15
Nodes (9): Redis-backed pub/sub for multi-instance, @graphql-yoga/redis-event-target, @graphql-yoga/redis-event-target, ioredis, ioredis, pm2, pm2, RedisEventTargetPubSub (+1 more)

### Community 25 - "Docker Stack Deployment"
Cohesion: 0.15
Nodes (26): MongoDB ReplicaSet requirement, KarsAvia deployment guide (v3.5.0), Host system requirements, Backend and frontend must be sibling directories, docker compose up --build first-run sequence, Empty database on first deployment, Test SUPERADMIN login credentials (admin/admin123), Docker Compose three-container stack (+18 more)

### Community 8 - "Bot Service & Webhooks"
Cohesion: 0.10
Nodes (19): Telegram Support Message Data Flow, Incoming Stage: Telegram Bot → Webhook/Polling → handleIncomingMessage, Message Persistence Stage (Message record in DB), Real-time Fan-out Stage: pubsub.publish(MESSAGE_SENT), Admin UI Subscription Stage, Admin Reply Stage (sendMessage mutation), Outbound Delivery Stage (bot.sendMessage back to Telegram), router (+11 more)

### Community 39 - "GraphQL Auth Context"
Cohesion: 0.18
Nodes (15): EMPTY_TOKEN_VALUES, AUTH_ERROR_CODES, AuthError, isAuthError(), extractToken(), isLikelyJwt(), raiseAuthError(), buildAuthContext() (+7 more)

### Community 67 - "Email & Push Notifications"
Cohesion: 0.33
Nodes (8): dispatcherOrSuperAdminMiddleware(), TRANSFER_NOTIFICATION_ACTIONS, dispatcherResolver, AIRLINE_POSITION_SEPARATORS, isAirlinePosition(), resolveAirlineId(), assertAirlinePositionForUser(), assertPositionAccess()

### Community 50 - "Package Config & Nodemon"
Cohesion: 0.12
Nodes (15): name, main, type, keywords, author, license, description, devDependencies (+7 more)

### Community 17 - "Backend Dependencies"
Cohesion: 0.06
Nodes (35): dependencies, @graphql-tools/schema, @graphql-tools/schema, @maxhub/max-bot-api, @maxhub/max-bot-api, archetype, archetype, axios (+27 more)

### Community 18 - "Airline Resolver & Price Geography"
Cohesion: 0.13
Nodes (31): priceValidity(), isWindowedPrice(), syncAirlinePriceGeography(), hasOwn(), syncDepartmentPositionLinks(), buildAirlineWhere(), emptyGeo, emptyHotelLocation (+23 more)

### Community 23 - "Global Resolvers & Logs"
Cohesion: 0.08
Nodes (17): airlineResolver, airportResolver, cityInclude, cityResolver, contractResolver, documentationResolver, SUBJECT, resolveAuthSubject() (+9 more)

### Community 46 - "Contract Resolver & Filters"
Cohesion: 0.21
Nodes (14): contractExpirationFields, agreementExpirationFields, deleteContractAndAgreementFiles(), removeContractFileRecord(), isArchivedContractFilter(), appendArchiveFilter(), buildAdditionalAgreementWhere(), buildAirlineContractWhere() (+6 more)

### Community 52 - "Driver & Organization Resolvers, uploadImage"
Cohesion: 0.23
Nodes (9): driverResolver, organizationResolver, safeSlug(), ensureDir(), buildUploadPath(), uploadImage(), deleteImage(), dateFormatter() (+1 more)

### Community 43 - "hotel"
Cohesion: 0.20
Nodes (12): roomKindSeasonResolver, AIRLINE_PRICE_KEYS, NESTED_LISTS, shouldHideAirlinePrices(), omitAirlineKeys(), omitAirlinePriceWrites(), hiddenAirlinePrice(), hiddenAirlineFlag() (+4 more)

### Community 40 - "Baggage Delivery Normalization"
Cohesion: 0.26
Nodes (15): normalizeBaggageTags(), has(), toMoney(), toWholeCountOrNull(), toTrimmedOrNull(), normalizeDriverPerson(), normalizePeopleForWrite(), normalizeDriversForWrite() (+7 more)

### Community 20 - "FAP Edit Guard & Request Envelope"
Cohesion: 0.14
Nodes (18): assertAirlineSubject(), getSubjectName(), loadRequestOrThrow(), assertIndex(), assertReason(), reportWhere(), finishPassengerRequestMutation(), withPassengerRequest() (+10 more)

### Community 47 - "Passenger Request Core Resolver & Service Table"
Cohesion: 0.18
Nodes (9): emptyPeopleService(), emptyLivingService(), emptyDriversService(), getTransferField(), driversFact(), PASSENGER_SERVICE_TABLE, PASSENGER_SERVICE_FIELDS, findPassengerService() (+1 more)

### Community 27 - "FAP Scope & Subscriptions"
Cohesion: 0.18
Nodes (20): viewerIsAirline(), viewerHotelIndexes(), allow(), DISPATCHER_ROLES, AIRLINE_ROLES, HOTEL_ROLES, denied(), resolveScope() (+12 more)

### Community 33 - "Living Resolver & Hotel Chess"
Cohesion: 0.19
Nodes (15): countLivingPeople(), withHotelPeople(), applyServiceRecalc(), assertHotelScopeAccess(), notifyHotelOverbookIfCrossed(), normalizeOptionalString(), ensureAccommodationChesses(), ensureHotelPerson() (+7 more)

### Community 54 - "Passenger Request Mutations"
Cohesion: 0.24
Nodes (6): normalizeBulkIndexes(), spliceAtIndexes(), closesBeforeStart(), closeOpenChess(), assertMoment(), AT

### Community 0 - "Passenger Request Resolver"
Cohesion: 0.05
Nodes (72): passengerRequestResolver, createRecognitionRateLimiter(), recognitionRateLimiter, HOTEL_CHESS_LOG_ACTIONS, KARS_FALLBACK_ACTIONS, resolveEmailActionForLog(), getDispatcherFallbackForPassengerEmail(), normalizeSnapshot() (+64 more)

### Community 34 - "Merge Saved People (duplicates)"
Cohesion: 0.19
Nodes (18): DRIVER_FIELDS, normalizeOptionalString(), badInput(), remapId(), rebindPeopleList(), rebindDriverService(), remapGroupMemberIds(), fillKeepFromDrops() (+10 more)

### Community 55 - "Transfer & Baggage Normalizers"
Cohesion: 0.36
Nodes (8): mapDriverAt(), driversServicePatch(), recomputeServiceStatus(), driverFactCount(), transferFactCount(), resolveDriverCountStatus(), resolveUserId(), updateTimes()

### Community 6 - "Bulk Request Import & logaction"
Cohesion: 0.08
Nodes (45): transferResolver, DATE_FIELDS, SUBJECT, getSubjectTokenWhere(), sendToToken(), sendToTokens(), sendNotificationToUser(), sendNotificationToSubject() (+37 more)

### Community 29 - "Auth: user.resolver, sign-in, refresh tokens"
Cohesion: 0.18
Nodes (22): requireTravellineSection(), compactAccessMenu(), ADMIN_HOTEL_AIR_ROLES, hasOwn(), forbidden(), unauthenticated(), getActor(), isSuperAdminRole() (+14 more)

### Community 28 - "Roster & Saved Passengers"
Cohesion: 0.22
Nodes (19): DRY_RUN, DRIVER_SERVICES, main(), normalizeOptionalString(), normalizePersonCategory(), normalizeFullNameKey(), rosterMatchKey(), dedupeSavedPassengers() (+11 more)

### Community 65 - "request"
Cohesion: 0.32
Nodes (8): loadEffectiveAccessMenuForUser(), forbidden(), normalizeStatus(), isRequestArchived(), requestArchiveVerdict(), assertRequestNotArchived(), assertRequestNotArchivedById(), moderator

### Community 44 - "Price Lookup by Hotel Location"
Cohesion: 0.26
Nodes (16): normalizeGeoValue(), hasGeoValue(), getHotelLocation(), applyCityRecord(), buildPriceSearchLocation(), getPriceGeographies(), sortByCreatedAtAsc(), pickFirst() (+8 more)

### Community 13 - "Request Pricing Calculation"
Cohesion: 0.13
Nodes (35): getCategoryPriceFromContract(), ACTIVE_STATUSES, roundMoney(), createAllocationKey(), getVehicleType(), computeTransferSpend(), computeTransferBudgetDetails(), computeRequestCosts() (+27 more)

### Community 30 - "Airline Analytics Builders"
Cohesion: 0.20
Nodes (24): roundMoney(), normalizeServices(), fetchRequests(), fetchTransfers(), getRequestBudget(), getServiceRequestBudget(), buildServiceRequestItems(), buildServiceAirportsFromRequests() (+16 more)

### Community 56 - "Airline Service Comparison"
Cohesion: 0.27
Nodes (12): assertDate(), validateRange(), normalizeServices(), normalizeRegions(), buildCrewWhere(), pct(), roundMoney(), getRegionToAirportIds() (+4 more)

### Community 48 - "Analytics: Dispatcher Performance & Stay Summary"
Cohesion: 0.24
Nodes (15): asDate(), safeParseJson(), avgOrNull(), logInRangeWhere(), ACTIONS_PLACEMENT_REQUEST, ACTIONS_HOTEL, ACTIONS_CONTRACT, ACTIONS_TRANSFER (+7 more)

### Community 21 - "FAP Passenger Analytics & Grouping"
Cohesion: 0.15
Nodes (25): PASSENGER_ANALYTICS_INCLUDE, computePassengerAnalytics(), TRANSFER_FIELDS, roundMoney(), sumHotelReportsCost(), sumTransferCost(), extractHotelNames(), countRequestPeople() (+17 more)

### Community 77 - "Analytics: Dispatcher Performance & Stay Summary"
Cohesion: 0.67
Nodes (5): toDayStartUtcMs(), toInclusiveEndMs(), mergeIntervals(), countDaysFromIntervals(), getPersonStaySummaries()

### Community 11 - "Passenger Request Emails"
Cohesion: 0.16
Nodes (35): getFrontendUrl(), withChatId(), buildRequestCardUrl(), buildPassengerRequestCardUrl(), buildEntityChatUrl(), esc(), span(), spanNo() (+27 more)

### Community 66 - "Auth: user.resolver, sign-in, refresh tokens"
Cohesion: 0.29
Nodes (9): normalizeUserLogin(), prismaOld, prismaNew, migrateUsers(), migrateHotels(), migrateRooms(), migrateAirlines(), runMigration() (+1 more)

### Community 36 - "Contract Archiving"
Cohesion: 0.19
Nodes (20): buildExpiredNoProlongationWhere(), applyArchiveData(), applyRestoreData(), performArchiveContract(), performArchiveAgreement(), archiveContractRecordInternal(), restoreContractRecordInternal(), archiveContractRecord() (+12 more)

### Community 51 - "Contract Expiration Sorting"
Cohesion: 0.18
Nodes (13): startOfUtcDay(), addUtcMonths(), getContractExpirationMeta(), compareContractsByExpiration(), sortContractsByExpiration(), assert(), now, contractWhere (+5 more)

### Community 49 - "File Upload & Deletion"
Cohesion: 0.26
Nodes (14): deleteContractFileFromDisk(), safeSlug(), ensureDir(), buildUploadPath(), uploadBuffer(), uploadFiles(), resolveAbsoluteFilePath(), deleteFiles() (+6 more)

### Community 24 - "Passenger Document Recognition"
Cohesion: 0.14
Nodes (13): EXTRACTION_PROMPT, prepareImage(), collapse(), normalizeFields(), computeConfidence(), EMPTY_RESULT, recognizePassengerDocument(), parseGptJson() (+5 more)

### Community 57 - "Room Kind Season Pricing"
Cohesion: 0.42
Nodes (12): toDayUtc(), addDaysUtc(), listStayNights(), seasonsOverlap(), assertValidSeasonRange(), assertNoSeasonOverlap(), findSeasonForNight(), resolvePriceForNight() (+4 more)

### Community 53 - "migrations"
Cohesion: 0.20
Nodes (13): DRY_RUN, WHERE, FIELDS, selectReportsToApprove(), approvalDataFor(), moment(), run(), main() (+5 more)

### Community 72 - "Email & Push Notifications"
Cohesion: 0.36
Nodes (7): prisma, ACTION_FIELDS, MENU_OWNERS, isBoolean(), buildNotificationMenuBackfill(), backfillForModel(), main()

### Community 1 - "Data Backfill & Travelline"
Cohesion: 0.05
Nodes (27): resolveDepartmentFromRecord(), backfillRequests(), backfillReserves(), main(), APPLY, isOpen(), findLastOpenIndex(), requestLabel() (+19 more)

### Community 73 - "One-off Migration Scripts"
Cohesion: 0.36
Nodes (7): DISPATCHER_ROLES, AIRLINE_ROLES, HOTEL_ROLES, KNOWN_ROLES, sample(), countDangling(), main()

### Community 80 - "One-off Migration Scripts"
Cohesion: 0.80
Nodes (4): toObjectIdString(), hasLegacyGeography(), fetchLegacyPriceDocs(), main()

### Community 78 - "One-off Migration Scripts"
Cohesion: 0.60
Nodes (5): toObjectIdString(), normalizeRegionName(), fetchCityDocs(), ensureRegionByName(), main()

### Community 70 - "Contract File Migration"
Cohesion: 0.33
Nodes (8): DRY_RUN, TARGETS, LEGACY_FILES_FILTER, hasLegacyFiles(), fetchLegacyDocs(), updateLegacyDoc(), migrateModel(), main()

### Community 41 - "Upload File Migration"
Cohesion: 0.19
Nodes (18): UPLOADS_ROOT, REPORTS_ROOT, REPORT_ROOT, ensureDir(), isTopLevelFile(), getFileDateParts(), buildTargetDir(), normalizeUploadPath() (+10 more)

### Community 58 - "FAP Scope & Subscriptions"
Cohesion: 0.20
Nodes (9): cache, defaultDeps, keyOf(), catalogVehicleNumber(), resetCatalogVehicleCache(), reportRowDate(), reportRowsEqual(), MONEY_KEYS (+1 more)

### Community 71 - "FAP Access Guards"
Cohesion: 0.44
Nodes (6): ALLOWED_SUBJECT_TYPES, assertFapSubject(), guardResolver(), guardSection(), guardSubscriptions(), withFapAuthGuard()

### Community 35 - "Partial-day Settings Rules"
Cohesion: 0.17
Nodes (20): REQUEST_STATUSES, requestIncludeAirline, requestIncludeHotel, buildAirlineReportData(), buildHotelReportData(), getDefaultPartialDayRules(), parseHhMmToMinutes(), assertValidHhMm() (+12 more)

### Community 31 - "Request Pricing Calculation"
Cohesion: 0.19
Nodes (23): getAirlineMealPrice(), roundMoney(), toStoredRequestPrice(), createAllocationKey(), REQUEST_INCLUDE_FOR_PRICING, AIRLINE_PRICES_INCLUDE, hydrateAirlinePrices(), staysOverlap() (+15 more)

### Community 76 - "Room Share Matrix (report nights)"
Cohesion: 0.57
Nodes (6): parseDDMMYYYY_HHMMSS(), startOfServiceDay(), addDays(), listServiceNights(), toRu(), computeRoomShareMatrix()

### Community 79 - "Price Geography Normalization Tests"
Cohesion: 0.33
Nodes (5): cityFindUnique, regionFindUnique, regionFindFirst, priceGeoFindMany, airportOnPriceFindMany

### Community 74 - "FAP Scope & Subscriptions"
Cohesion: 0.25
Nodes (5): dispatcher, airlinePersonal, hotelExternal, own, foreign

## Ambiguous Edges - Review These
- `Legacy schema migration script` → `airload.js`  [AMBIGUOUS]
  README.md · relation: conceptually_related_to
- `PubSub subscriptions and subscription context` → `corsOptions.js`  [AMBIGUOUS]
  README.md · relation: conceptually_related_to
- `Published ports 3000 and 4000` → `Host Port 4001 → Container 4000 Mapping`  [AMBIGUOUS]
  INSTALL.md · relation: conceptually_related_to

## Knowledge Gaps
- **196 isolated node(s):** `Test SUPERADMIN login credentials (admin/admin123)`, `rl`, `AUTH_ERROR_CODES`, `name`, `main` (+191 more)
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
- **Why does `prisma` connect `Documentation Tree & Backfill` to `Passenger Request Resolver`, `Data Backfill & Travelline`, `User Presence & Stale Sessions`, `Report Drafts: merge, frozen rows, changedFrom`, `Email Notifications: templates, rate guard, menu check`, `External Auth: Magic Links & Hotel Preview`, `Bulk Request Import & logaction`, `System Updates & Maintenance Banner`, `Bot Service & Webhooks`, `Server Entry & Auth Middleware`, `Global Resolvers & Logs`, `Passenger Request Emails`, `Request Pricing Calculation`, `Real-time PubSub Subscriptions`, `Request Resolver & Bulk Import`, `Airline Resolver & Price Geography`, `FAP Edit Guard & Request Envelope`, `FAP Passenger Analytics & Grouping`, `External Auth: Magic Links & Hotel Preview`, `Global Resolvers & Logs`, `Docker Stack Deployment`, `Auth: user.resolver, sign-in, refresh tokens`, `FAP Scope & Subscriptions`, `Roster & Saved Passengers`, `Airline Analytics Builders`, `Request Pricing Calculation`, `Living Resolver & Hotel Chess`, `Merge Saved People (duplicates)`, `Partial-day Settings Rules`, `Contract Archiving`, `GraphQL Auth Context`, `Upload File Migration`, `Room Occupancy Overlap`, `hotel`, `Price Lookup by Hotel Location`, `Analytics: Dispatcher Performance & Stay Summary`, `Contract Resolver & Filters`, `Analytics: Dispatcher Performance & Stay Summary`, `Driver & Organization Resolvers, uploadImage`, `migrations`, `Airline Service Comparison`, `FAP Scope & Subscriptions`, `File Access Routes & Backup`, `request`, `Auth: user.resolver, sign-in, refresh tokens`, `Email & Push Notifications`, `Contract File Migration`, `One-off Migration Scripts`, `Analytics: Dispatcher Performance & Stay Summary`, `One-off Migration Scripts`, `One-off Migration Scripts`?**
  _High betweenness centrality (0.264) - this node is a cross-community bridge._
- **Why does `dependencies` connect `Backend Dependencies` to `Winston File Logger`, `User Presence & Stale Sessions`, `Backend Tech Stack`, `One-off Migration Scripts`, `TOTP Two-factor Auth`, `Package Config & Nodemon`, `File Access Routes & Backup`, `Backend Dependencies`, `Backend Dependencies`, `Backend Dependencies`, `Backend Dependencies`, `Backend Dependencies`, `Support Chat Data Flow (doc stages)`?**
  _High betweenness centrality (0.096) - this node is a cross-community bridge._
- **Why does `TravellineService` connect `Data Backfill & Travelline` to `Server Entry & Auth Middleware`, `Global Resolvers & Logs`?**
  _High betweenness centrality (0.039) - this node is a cross-community bridge._
- **Are the 4 inferred relationships involving `prisma` (e.g. with `MongoDB ReplicaSet requirement` and `MongoDB Service (single node, replica set rs0)`) actually correct?**
  _`prisma` has 4 INFERRED edges - model-reasoned connections that need verification._