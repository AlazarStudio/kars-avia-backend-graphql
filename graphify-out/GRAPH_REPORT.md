# Graph Report - .  (2026-09-10)

## Corpus Check
- 370 files · ~244,213 words
- Verdict: corpus is large enough that graph structure adds value.

## Summary
- 2047 nodes · 5689 edges · 99 communities (82 shown, 17 thin omitted)
- Extraction: 95% EXTRACTED · 5% INFERRED · 0% AMBIGUOUS · INFERRED: 280 edges (avg confidence: 0.84)
- Token cost: 0 input · 0 output

## Community Hubs (Navigation)
- Backend Health & Conventions
- FAP Passenger Analytics & Grouping
- Transfer Push (Firebase) & transfer.resolver
- User Presence & Stale Sessions
- Contract File Management
- Access: assertCanManageAccess.js guards & Travelline role checks
- Room Occupancy Overlap
- Documentation Tree & Backfill
- Global Resolvers & Logs
- Email Notifications: templates, rate guard, menu check
- External Auth: Magic Links & Hotel Preview
- File Access Routes & Backup
- Request Resolver & Bulk Import
- One-off Migration Scripts
- Winston File Logger
- System Updates & Maintenance Banner
- Global Resolvers & Logs
- FAP Scope & Subscriptions
- Email & Push Notifications
- Bot Service & Webhooks
- Report Drafts: merge, frozen rows, changedFrom
- Auth: user.resolver, sign-in, refresh tokens
- Data Backfill & Travelline
- File Access Routes & Backup
- File Access Routes & Backup
- Backend Tech Stack
- Prisma Workflow & Scripts
- Server Entry & Auth Middleware
- Server Entry & Auth Middleware
- GraphQL Auth Context
- TOTP Two-factor Auth
- File Access Routes & Backup
- Docker Stack Deployment
- Package Config & Nodemon
- Global Resolvers & Logs
- Docker Stack Deployment
- User Presence & Stale Sessions
- Resolvers: representative, global, city, airport, log, airline
- Backend Dependencies
- Backend Dependencies
- Email & Push Notifications
- Backend Dependencies
- Backend Dependencies
- Backend Dependencies
- Backend Dependencies
- Backend Dependencies
- Backend Dependencies
- Backend Dependencies
- Support Chat Data Flow (doc stages)
- Backend Dependencies
- Backend Dependencies
- Backend Dependencies
- Airline Resolver & Price Geography
- Contract Resolver & Filters
- External Auth: Magic Links & Hotel Preview
- FAP Edit Guard & Request Envelope
- FAP Edit Guard & Request Envelope
- FAP Scope & Subscriptions
- Passenger Request Resolver
- Merge Saved People (duplicates)
- Transfer & Baggage Normalizers
- Roster & Saved Passengers
- Price Lookup by Hotel Location
- Request Pricing Calculation
- Airline Analytics Builders
- Request Pricing Calculation
- Airline Service Comparison
- External Auth: Magic Links & Hotel Preview
- Contract Archiving
- Contract Archiving
- Passenger Document Recognition
- Passenger Request Emails
- File Upload & Deletion
- Hotel Preview: hotelPreviewLink.js, roomUtils, hotelFilters
- Bulk Request Import & logaction
- Bulk Request Import & logaction
- migrations
- Documentation Tree & Backfill
- Documentation Tree & Backfill
- Data Backfill & Travelline
- One-off Migration Scripts
- Data Backfill & Travelline
- One-off Migration Scripts
- One-off Migration Scripts
- Contract File Migration
- Upload File Migration
- Documentation Tree & Backfill
- Baggage Delivery Normalization
- Passenger Request Mutations
- FAP Access Guards
- Living Resolver & Hotel Chess
- Partial-day Settings Rules
- Request Pricing: requestPricing.js allocation & clustering
- Documentation Tree & Backfill
- Room Share Matrix (report nights)
- Price Search Location Tests
- Contract Expiration Sorting
- Price Geography Normalization Tests
- Passenger Request Resolver

## God Nodes (most connected - your core abstractions)
1. `prisma` - 118 edges
2. `TravellineService` - 50 edges
3. `installPrismaDouble()` - 46 edges
4. `logger` - 32 edges
5. `pubsub` - 32 edges
6. `makeRequest()` - 29 edges
7. `allMiddleware()` - 26 edges
8. `BotService` - 25 edges
9. `installPubsubSpy()` - 25 edges
10. `aggregatePassengerRequest()` - 19 edges

## Surprising Connections (you probably didn't know these)
- `Meal plan calculation (MealPlan / DailyMeal)` --shares_data_with--> `calculateMealCost()`  [INFERRED]
  README.md → services/report/reports.js
- `Real-time GraphQL subscriptions` --references--> `wsServer`  [INFERRED]
  CLAUDE.md → server2.js
- `Redis-backed pub/sub for multi-instance` --references--> `@graphql-yoga/redis-event-target`  [INFERRED]
  CLAUDE.md → package.json
- `Redis-backed pub/sub for multi-instance` --references--> `ioredis`  [INFERRED]
  CLAUDE.md → package.json
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

## Communities (99 total, 17 thin omitted)

### Community 46 - "Backend Health & Conventions"
Cohesion: 0.16
Nodes (16): Kars Avia GraphQL Backend, Unified auth middleware, GET /health with app version, House rules for writing code, Visual style discipline, Token economy rule, KarsAvia GraphQL Backend (v3.5.0), Dual entry points (server2.js / server.js) (+8 more)

### Community 5 - "FAP Passenger Analytics & Grouping"
Cohesion: 0.07
Nodes (54): Analytics module, analyticsResolver, buildWhereConditionsRequests(), analyticsUserRequests(), createdByPeriodForEntityRequests(), totalCreatedRequests(), totalCancelledRequests(), countRequestsByStatus() (+46 more)

### Community 19 - "Transfer Push (Firebase) & transfer.resolver"
Cohesion: 0.09
Nodes (5): Composite Prisma types (Information, Price, MealPrice, MealPlan), Driver / representative / organization entities, Global shared schema and resolver layer, Report engine versioning (v5 to v7), Per-domain GraphQL module layout

### Community 15 - "User Presence & Stale Sessions"
Cohesion: 0.12
Nodes (29): Cron auto-archiving of expired contracts, Request archiving with cron and grace period, Scheduled cron jobs, node-cron, node-cron, buildSavedReportListWhere(), moveExpiredToArchiving(), finalizeArchivingRequests() (+21 more)

### Community 21 - "Contract File Management"
Cohesion: 0.15
Nodes (22): Contracts module, deleteContractAndAgreementFiles(), appendUploadedContractFiles(), removeContractFileRecord(), deriveDisplayNameFromPath(), normalizeContractFiles(), extractFileUrls(), validateContractFileUploadInput() (+14 more)

### Community 7 - "Access: assertCanManageAccess.js guards & Travelline role checks"
Cohesion: 0.07
Nodes (44): Department access control (accessMenu), AccessMenu feature-flag permissions, requireTravellineSection(), ACCESS_MENU_KEYS, hasOwn(), compactAccessMenu(), ADMIN_HOTEL_AIR_ROLES, hasOwn() (+36 more)

### Community 13 - "Room Occupancy Overlap"
Cohesion: 0.11
Nodes (26): Dependency hygiene and resource reduction, HotelChess to Room relation via nested connect, Pagination and server payload reduction, Room categories and tariffs, Hotel room counters and recount, Room occupancy overlap rules, transporter, hotelResolver (+18 more)

### Community 52 - "Documentation Tree & Backfill"
Cohesion: 0.23
Nodes (3): Documentation tree and hierarchy, deleteSectionCascade(), getSectionsHierarchyJSONOptimized()

### Community 22 - "Global Resolvers & Logs"
Cohesion: 0.15
Nodes (19): Duplicate request detection, Request number generation, transporter, reverseDateTimeFormatter(), formatDate(), logAction(), resolveCreatorDepartmentFromSender(), buildRequestListWhere() (+11 more)

### Community 2 - "Email Notifications: templates, rate guard, menu check"
Cohesion: 0.07
Nodes (60): Transactional email delivery, Firebase push notifications, Notification subsystem, Two-factor authentication (speakeasy + QR), getFrontendUrl(), getSupportEmail(), getServiceName(), esc() (+52 more)

### Community 31 - "External Auth: Magic Links & Hotel Preview"
Cohesion: 0.20
Nodes (18): External auth via magic link, SUBJECT_TYPE, EXTERNAL_SCOPES, EXTERNAL_ACCESS_TYPES, throwForbidden(), resolveAdminId(), issueTokenForExternalUser(), buildExternalAuthPayload() (+10 more)

### Community 50 - "File Access Routes & Backup"
Cohesion: 0.23
Nodes (12): File access control and path normalization, Hotel preview links, Secure File Access System, Automatic File Path Normalization (/uploads → /files/uploads), File Path Field Resolvers (Request.files, Hotel.images, ReportFile.url, …), JWT Bearer Authorization for File Downloads, Dual Path Format Backward Compatibility, authMiddleware() (+4 more)

### Community 28 - "Request Resolver & Bulk Import"
Cohesion: 0.15
Nodes (22): Group and bulk requests, HEADER_MATCHERS, normalizeHeader(), mapHeaders(), parseExcelDate(), parseExcelTime(), combineDateAndTime(), normalizeFlightStatus() (+14 more)

### Community 55 - "One-off Migration Scripts"
Cohesion: 0.18
Nodes (7): Legacy schema migration script, Upload and backfill migrations, Thin resolvers, fat service layer, One-off migration scripts, prisma, DEFAULT, main()

### Community 61 - "Winston File Logger"
Cohesion: 0.42
Nodes (9): Logs as a first-class model with pagination, Winston plus monthly-rotation file logger, ensuredDirs, getTimeStamp(), getLogFilePath(), ensureLogDir(), appendLog(), logToFile() (+1 more)

### Community 10 - "System Updates & Maintenance Banner"
Cohesion: 0.11
Nodes (38): Maintenance banner with live subscription, Semver comparison gating for release visibility, System update notifications (SystemUpdate), siteResolver, hasLegacySections(), main(), getMaintenanceBanner(), updateMaintenanceBanner() (+30 more)

### Community 47 - "Global Resolvers & Logs"
Cohesion: 0.23
Nodes (8): Meal plan calculation (MealPlan / DailyMeal), Reserve module, reserveResolver, isPrismaError(), rethrowUnlessInternalError(), calculateMeal(), updateDailyMeals(), generateReserveExcel()

### Community 56 - "Email & Push Notifications"
Cohesion: 0.30
Nodes (9): Positions (должности) model consolidation, dispatcherOrSuperAdminMiddleware(), TRANSFER_NOTIFICATION_ACTIONS, dispatcherResolver, AIRLINE_POSITION_SEPARATORS, isAirlinePosition(), resolveAirlineId(), assertAirlinePositionForUser() (+1 more)

### Community 1 - "Bot Service & Webhooks"
Cohesion: 0.05
Nodes (51): PubSub subscriptions and subscription context, Support chat separated from main chats, Real-time GraphQL subscriptions, PubSub topic naming, Redis-backed pub/sub for multi-instance, Telegram Support Message Data Flow, Incoming Stage: Telegram Bot → Webhook/Polling → handleIncomingMessage, Message Persistence Stage (Message record in DB) (+43 more)

### Community 9 - "Report Drafts: merge, frozen rows, changedFrom"
Cohesion: 0.08
Nodes (43): Report exporter (XLSX styling, sorting, PDF conversion), buildDraftPresentation(), writeExcelAndSave(), normalizeReportDraftRows(), colLetter(), writeStyledWorkbook(), generateExcelAvia(), generateExcelHotel() (+35 more)

### Community 3 - "Auth: user.resolver, sign-in, refresh tokens"
Cohesion: 0.06
Nodes (59): Access/refresh token lifecycle, User presence and last-visit tracking, SUBJECT, resolveAuthSubject(), globalResolver, buildUserAuthPayload(), normalizeUserLogin(), registerSelfUser() (+51 more)

### Community 4 - "Data Backfill & Travelline"
Cohesion: 0.06
Nodes (19): TravelLine integration, normalizeAutoSyncHours(), isAutoSyncDue(), timePart(), buildStayDatesWithExtras(), parseVerifyResponse(), toUtcMs(), computeTzOffset() (+11 more)

### Community 62 - "File Access Routes & Backup"
Cohesion: 0.38
Nodes (9): File Access Rules by Role, JWT-protected /files/* route, Host-mounted runtime directories, normalizeRelativePath(), isSuperadminOrDispatcherUser(), checkReportFileAccess(), checkFileAccess(), loadHotelPreviewDataForFileAccess() (+1 more)

### Community 58 - "File Access Routes & Backup"
Cohesion: 0.31
Nodes (10): Protected /files/* Route, Storage Roots (uploads, reports, reserve_files), Backend Persistent Bind Mounts (uploads, reports, reserve_files, logs, backups), BACKUP_DIR, RESERVE_FILES_ROOT, router, UPLOADS_ROOT, REPORTS_ROOT (+2 more)

### Community 30 - "Backend Tech Stack"
Cohesion: 0.10
Nodes (23): Backend tech stack, Browser → React SPA → GraphQL API → MongoDB flow, @apollo/server, @apollo/server, @graphql-tools/merge, @graphql-tools/merge, @prisma/client, argon2 (+15 more)

### Community 37 - "Prisma Workflow & Scripts"
Cohesion: 0.19
Nodes (19): npm script catalogue, Schema-first Prisma workflow, generated/client is not hand-editable, scripts, backup, start, start2, production (+11 more)

### Community 60 - "Server Entry & Auth Middleware"
Cohesion: 0.24
Nodes (8): Environment variable contract (.env), .env is committed with dev values, .env.docker and .env.example configuration, wsKeepAliveParsed, wsKeepAliveParsed, __filename, __dirname, serviceAccountPath

### Community 14 - "Server Entry & Auth Middleware"
Cohesion: 0.10
Nodes (28): Central typeDef/resolver mergers, mergedResolvers, require, httpServer, httpsServer, schema, serverCleanup, server (+20 more)

### Community 36 - "GraphQL Auth Context"
Cohesion: 0.18
Nodes (15): JWT authentication into GraphQL context, EMPTY_TOKEN_VALUES, AUTH_ERROR_CODES, AuthError, isAuthError(), extractToken(), isLikelyJwt(), raiseAuthError() (+7 more)

### Community 71 - "TOTP Two-factor Auth"
Cohesion: 0.29
Nodes (7): TOTP two-factor authentication, @levminer/speakeasy, @levminer/speakeasy, qrcode, qrcode, speakeasy, speakeasy

### Community 66 - "File Access Routes & Backup"
Cohesion: 0.22
Nodes (9): File and document generation, exceljs, exceljs, graphql-upload, graphql-upload, pdfkit, pdfkit, sharp (+1 more)

### Community 49 - "Docker Stack Deployment"
Cohesion: 0.21
Nodes (9): MongoDB ReplicaSet requirement, karsavia-mongo container, karsavia-mongo-data Docker volume, Stack management commands, docker compose down -v destroys all data, MongoDB port is not published, MongoDB Service (single node, replica set rs0), karsavia-mongo-data Named Volume (+1 more)

### Community 41 - "Package Config & Nodemon"
Cohesion: 0.11
Nodes (17): Nodemon ignores runtime write directories, name, main, type, keywords, author, license, description (+9 more)

### Community 20 - "Global Resolvers & Logs"
Cohesion: 0.15
Nodes (21): Role-based middleware decorators, roleMiddleware(), dispatcherModerMiddleware(), superAdminMiddleware(), adminMiddleware(), adminHotelAirMiddleware(), representativeMiddleware(), moderatorMiddleware() (+13 more)

### Community 38 - "Docker Stack Deployment"
Cohesion: 0.21
Nodes (18): KarsAvia deployment guide (v3.5.0), Host system requirements, Backend and frontend must be sibling directories, docker compose up --build first-run sequence, Empty database on first deployment, Test SUPERADMIN login credentials (admin/admin123), Docker Compose three-container stack, karsavia-frontend container (+10 more)

### Community 63 - "User Presence & Stale Sessions"
Cohesion: 0.36
Nodes (8): rl, showMenu(), handleUserInput(), __filename, __dirname, createBackup(), restoreBackup(), listBackups()

### Community 12 - "Resolvers: representative, global, city, airport, log, airline"
Cohesion: 0.08
Nodes (21): allMiddleware(), airportResolver, cityInclude, cityResolver, documentationResolver, driverResolver, externalAuthResolver, roomKindSeasonResolver (+13 more)

### Community 18 - "Backend Dependencies"
Cohesion: 0.07
Nodes (27): dependencies, @graphql-tools/schema, @graphql-tools/schema, @graphql-yoga/redis-event-target, @graphql-yoga/redis-event-target, archetype, archetype, cli-progress (+19 more)

### Community 67 - "Email & Push Notifications"
Cohesion: 0.31
Nodes (8): @prisma/client, prisma, ACTION_FIELDS, MENU_OWNERS, isBoolean(), buildNotificationMenuBackfill(), backfillForModel(), main()

### Community 6 - "Airline Resolver & Price Geography"
Cohesion: 0.07
Nodes (54): priceValidity(), isWindowedPrice(), syncAirlinePriceGeography(), hasOwn(), syncDepartmentPositionLinks(), airlineResolver, buildAirlineWhere(), emptyGeo (+46 more)

### Community 34 - "Contract Resolver & Filters"
Cohesion: 0.19
Nodes (16): contractExpirationFields, agreementExpirationFields, contractResolver, isArchivedContractFilter(), appendArchiveFilter(), buildAdditionalAgreementWhere(), startOfUtcDay(), addUtcMonths() (+8 more)

### Community 42 - "External Auth: Magic Links & Hotel Preview"
Cohesion: 0.24
Nodes (11): issueExternalDriverPwaLink(), buildRepresentativeExternalKey(), generateDriverLink(), reissueShiftedDriverLinks(), generateRepresentativeLinksForRequest(), newDriverId(), ensureDriverIds(), readLinkParam() (+3 more)

### Community 23 - "FAP Edit Guard & Request Envelope"
Cohesion: 0.12
Nodes (12): forbidden(), editLockVerdict(), assertRequestEditable(), stable(), patchIsNoop(), driversFact(), PASSENGER_SERVICE_TABLE, PASSENGER_SERVICE_FIELDS (+4 more)

### Community 24 - "FAP Edit Guard & Request Envelope"
Cohesion: 0.20
Nodes (16): normalizeBulkIndexes(), spliceAtIndexes(), getSubjectName(), loadRequestOrThrow(), assertIndex(), assertMoment(), assertReason(), reportWhere() (+8 more)

### Community 8 - "FAP Scope & Subscriptions"
Cohesion: 0.07
Nodes (39): viewerIsAirline(), viewerHotelIndexes(), assertAirlineSubject(), allow(), cache, defaultDeps, keyOf(), catalogVehicleNumber() (+31 more)

### Community 0 - "Passenger Request Resolver"
Cohesion: 0.05
Nodes (72): passengerRequestResolver, createRecognitionRateLimiter(), recognitionRateLimiter, HOTEL_CHESS_LOG_ACTIONS, KARS_FALLBACK_ACTIONS, resolveEmailActionForLog(), getDispatcherFallbackForPassengerEmail(), logPassengerRequestAction() (+64 more)

### Community 32 - "Merge Saved People (duplicates)"
Cohesion: 0.19
Nodes (18): DRIVER_FIELDS, normalizeOptionalString(), badInput(), remapId(), rebindPeopleList(), rebindDriverService(), remapGroupMemberIds(), fillKeepFromDrops() (+10 more)

### Community 43 - "Transfer & Baggage Normalizers"
Cohesion: 0.29
Nodes (12): mapDriverAt(), driversServicePatch(), normalizeOptionalString(), normalizeCrewMember(), getTransferField(), getTransferServiceKind(), ensureDriverPerson(), normalizePassengerServiceDriver() (+4 more)

### Community 25 - "Roster & Saved Passengers"
Cohesion: 0.21
Nodes (20): DRY_RUN, DRIVER_SERVICES, main(), normalizeOptionalString(), normalizePersonType(), normalizePersonCategory(), normalizeFullNameKey(), rosterMatchKey() (+12 more)

### Community 39 - "Price Lookup by Hotel Location"
Cohesion: 0.25
Nodes (17): normalizeGeoValue(), hasGeoValue(), getHotelLocation(), applyCityRecord(), buildPriceSearchLocation(), getPriceGeographies(), sortByCreatedAtAsc(), pickFirst() (+9 more)

### Community 26 - "Request Pricing Calculation"
Cohesion: 0.13
Nodes (22): getCategoryPriceFromContract(), isArchivedRequestForPricing(), getBaseHotelPricePerDay(), REQUEST_STATUSES, requestIncludeAirline, requestIncludeHotel, buildHotelReportData(), TECH_POS (+14 more)

### Community 27 - "Airline Analytics Builders"
Cohesion: 0.20
Nodes (24): roundMoney(), normalizeServices(), fetchRequests(), fetchTransfers(), getRequestBudget(), getServiceRequestBudget(), buildServiceRequestItems(), buildServiceAirportsFromRequests() (+16 more)

### Community 29 - "Request Pricing Calculation"
Cohesion: 0.20
Nodes (21): ACTIVE_STATUSES, roundMoney(), createAllocationKey(), getVehicleType(), computeTransferSpend(), computeTransferBudgetDetails(), computeRequestCosts(), buildRequestRowForAllocation() (+13 more)

### Community 51 - "Airline Service Comparison"
Cohesion: 0.27
Nodes (12): assertDate(), validateRange(), normalizeServices(), normalizeRegions(), buildCrewWhere(), pct(), roundMoney(), getRegionToAirportIds() (+4 more)

### Community 59 - "External Auth: Magic Links & Hotel Preview"
Cohesion: 0.33
Nodes (10): buildExpiryDate(), createMagicLinkRecord(), issueExternalLinksForUser(), upsertHotelExternalUser(), upsertRepresentativeExternalUser(), buildDriverExternalEmail(), revokeDriverExternalAccess(), upsertDriverExternalUser() (+2 more)

### Community 57 - "Contract Archiving"
Cohesion: 0.30
Nodes (11): applyArchiveData(), applyRestoreData(), performArchiveContract(), performArchiveAgreement(), archiveContractRecordInternal(), restoreContractRecordInternal(), archiveContractRecord(), restoreContractRecord() (+3 more)

### Community 64 - "Contract Archiving"
Cohesion: 0.42
Nodes (9): buildExpiredNoProlongationWhere(), archiveAgreementRecordInternal(), publishContractUpdate(), archiveExpiredContracts(), getAgreementParentTopic(), loadAgreementParentContract(), archiveExpiredAgreements(), checkAndArchiveExpiredContracts() (+1 more)

### Community 16 - "Passenger Document Recognition"
Cohesion: 0.14
Nodes (13): EXTRACTION_PROMPT, prepareImage(), collapse(), normalizeFields(), computeConfidence(), EMPTY_RESULT, recognizePassengerDocument(), parseGptJson() (+5 more)

### Community 11 - "Passenger Request Emails"
Cohesion: 0.16
Nodes (34): withChatId(), buildRequestCardUrl(), buildPassengerRequestCardUrl(), buildEntityChatUrl(), esc(), span(), spanNo(), formatPassengerRequestLabel() (+26 more)

### Community 73 - "File Upload & Deletion"
Cohesion: 0.73
Nodes (5): safeSlug(), ensureDir(), buildUploadPath(), uploadBuffer(), uploadFiles()

### Community 53 - "Hotel Preview: hotelPreviewLink.js, roomUtils, hotelFilters"
Cohesion: 0.27
Nodes (11): normalizeBaseUrl(), buildPreviewBaseUrl(), clampPreviewHours(), buildHotelPreviewUrl(), collectHotelPreviewFilePaths(), isHotelPreviewFilePathAllowed(), findValidHotelPreviewLink(), buildHotelPreviewAuthPayload() (+3 more)

### Community 33 - "Bulk Request Import & logaction"
Cohesion: 0.19
Nodes (20): SUBJECT, getSubjectTokenWhere(), sendToToken(), sendToTokens(), sendNotificationToUser(), sendNotificationToSubject(), sendNotificationToUsers(), SUBJECT (+12 more)

### Community 35 - "Bulk Request Import & logaction"
Cohesion: 0.22
Nodes (19): LARGE_ARRAY_KEYS, isPlainObject(), shouldCompactArrayByKey(), truncateString(), sanitizeLargeFields(), getByPath(), setByPath(), pick() (+11 more)

### Community 48 - "migrations"
Cohesion: 0.20
Nodes (13): DRY_RUN, WHERE, FIELDS, selectReportsToApprove(), approvalDataFor(), moment(), run(), main() (+5 more)

### Community 83 - "Documentation Tree & Backfill"
Cohesion: 0.83
Nodes (3): isObjectId(), parse(), main()

### Community 78 - "Documentation Tree & Backfill"
Cohesion: 0.60
Nodes (4): APPLY, composeHotelAddress(), sameString(), main()

### Community 79 - "Data Backfill & Travelline"
Cohesion: 0.80
Nodes (4): resolveDepartmentFromRecord(), backfillRequests(), backfillReserves(), main()

### Community 70 - "One-off Migration Scripts"
Cohesion: 0.36
Nodes (7): DISPATCHER_ROLES, AIRLINE_ROLES, HOTEL_ROLES, KNOWN_ROLES, sample(), countDangling(), main()

### Community 74 - "Data Backfill & Travelline"
Cohesion: 0.53
Nodes (5): APPLY, isOpen(), findLastOpenIndex(), requestLabel(), main()

### Community 80 - "One-off Migration Scripts"
Cohesion: 0.80
Nodes (4): toObjectIdString(), hasLegacyGeography(), fetchLegacyPriceDocs(), main()

### Community 75 - "One-off Migration Scripts"
Cohesion: 0.60
Nodes (5): toObjectIdString(), normalizeRegionName(), fetchCityDocs(), ensureRegionByName(), main()

### Community 68 - "Contract File Migration"
Cohesion: 0.33
Nodes (8): DRY_RUN, TARGETS, LEGACY_FILES_FILTER, hasLegacyFiles(), fetchLegacyDocs(), updateLegacyDoc(), migrateModel(), main()

### Community 40 - "Upload File Migration"
Cohesion: 0.19
Nodes (18): UPLOADS_ROOT, REPORTS_ROOT, REPORT_ROOT, ensureDir(), isTopLevelFile(), getFileDateParts(), buildTargetDir(), normalizeUploadPath() (+10 more)

### Community 44 - "Baggage Delivery Normalization"
Cohesion: 0.25
Nodes (15): normalizeBaggageTags(), has(), toMoney(), toWholeCountOrNull(), toTrimmedOrNull(), normalizeDriverPerson(), normalizePeopleForWrite(), normalizeDriversForWrite() (+7 more)

### Community 76 - "Passenger Request Mutations"
Cohesion: 0.47
Nodes (3): closesBeforeStart(), closeOpenChess(), AT

### Community 69 - "FAP Access Guards"
Cohesion: 0.44
Nodes (6): ALLOWED_SUBJECT_TYPES, assertFapSubject(), guardResolver(), guardSection(), guardSubscriptions(), withFapAuthGuard()

### Community 45 - "Living Resolver & Hotel Chess"
Cohesion: 0.18
Nodes (10): countLivingPeople(), withHotelPeople(), applyServiceRecalc(), notifyHotelOverbookIfCrossed(), ensureAccommodationChesses(), ensureHotelPerson(), flightDateTimeMs(), passengerRequestFlightDateChanged() (+2 more)

### Community 54 - "Partial-day Settings Rules"
Cohesion: 0.32
Nodes (11): getDefaultPartialDayRules(), parseHhMmToMinutes(), assertValidHhMm(), settingToRules(), rulesToCalcConfig(), ensureGlobalPartialDaySetting(), resolvePartialDayRules(), validateLevelEntity() (+3 more)

### Community 17 - "Request Pricing: requestPricing.js allocation & clustering"
Cohesion: 0.17
Nodes (27): getAirlineMealPrice(), calculateMealCostForReportDays(), formatLocalDate(), roundMoney(), toStoredRequestPrice(), createAllocationKey(), REQUEST_INCLUDE_FOR_PRICING, AIRLINE_PRICES_INCLUDE (+19 more)

### Community 72 - "Room Share Matrix (report nights)"
Cohesion: 0.57
Nodes (6): parseDDMMYYYY_HHMMSS(), startOfServiceDay(), addDays(), listServiceNights(), toRu(), computeRoomShareMatrix()

### Community 65 - "Contract Expiration Sorting"
Cohesion: 0.24
Nodes (8): assert(), now, contractWhere, agreementWhere, activeFilter, archivedFilter, createContractModelMock(), createAgreementPrismaMock()

### Community 77 - "Price Geography Normalization Tests"
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
- **196 isolated node(s):** `Test SUPERADMIN login credentials (admin/admin123)`, `rl`, `AUTH_ERROR_CODES`, `name`, `main` (+191 more)
  These have ≤1 connection - possible missing edges or undocumented components.
- **17 thin communities (<3 nodes) omitted from report** — run `graphify query` to explore isolated nodes.

## Suggested Questions
_Questions this graph is uniquely positioned to answer:_

- **What is the exact relationship between `Legacy schema migration script` and `airload.js`?**
  _Edge tagged AMBIGUOUS (relation: conceptually_related_to) - confidence is low._
- **What is the exact relationship between `PubSub subscriptions and subscription context` and `corsOptions.js`?**
  _Edge tagged AMBIGUOUS (relation: conceptually_related_to) - confidence is low._
- **What is the exact relationship between `Published ports 3000 and 4000` and `Host Port 4001 → Container 4000 Mapping`?**
  _Edge tagged AMBIGUOUS (relation: conceptually_related_to) - confidence is low._
- **Why does `prisma` connect `Docker Stack Deployment` to `Passenger Request Resolver`, `Bot Service & Webhooks`, `Email Notifications: templates, rate guard, menu check`, `Auth: user.resolver, sign-in, refresh tokens`, `Data Backfill & Travelline`, `FAP Passenger Analytics & Grouping`, `Airline Resolver & Price Geography`, `Access: assertCanManageAccess.js guards & Travelline role checks`, `FAP Scope & Subscriptions`, `Report Drafts: merge, frozen rows, changedFrom`, `System Updates & Maintenance Banner`, `Passenger Request Emails`, `Resolvers: representative, global, city, airport, log, airline`, `Room Occupancy Overlap`, `Server Entry & Auth Middleware`, `User Presence & Stale Sessions`, `Request Pricing: requestPricing.js allocation & clustering`, `Global Resolvers & Logs`, `Global Resolvers & Logs`, `FAP Edit Guard & Request Envelope`, `FAP Edit Guard & Request Envelope`, `Roster & Saved Passengers`, `Request Pricing Calculation`, `Airline Analytics Builders`, `Request Pricing Calculation`, `External Auth: Magic Links & Hotel Preview`, `Merge Saved People (duplicates)`, `Bulk Request Import & logaction`, `Contract Resolver & Filters`, `Bulk Request Import & logaction`, `GraphQL Auth Context`, `Price Lookup by Hotel Location`, `Upload File Migration`, `External Auth: Magic Links & Hotel Preview`, `Living Resolver & Hotel Chess`, `Global Resolvers & Logs`, `migrations`, `Airline Service Comparison`, `Documentation Tree & Backfill`, `Hotel Preview: hotelPreviewLink.js, roomUtils, hotelFilters`, `Partial-day Settings Rules`, `One-off Migration Scripts`, `Email & Push Notifications`, `External Auth: Magic Links & Hotel Preview`, `File Access Routes & Backup`, `Contract Archiving`, `Contract File Migration`, `One-off Migration Scripts`, `Data Backfill & Travelline`, `One-off Migration Scripts`, `Documentation Tree & Backfill`, `Data Backfill & Travelline`, `One-off Migration Scripts`, `Documentation Tree & Backfill`, `Documentation Tree & Backfill`, `Documentation Tree & Backfill`, `Passenger Request Resolver`?**
  _High betweenness centrality (0.279) - this node is a cross-community bridge._
- **Why does `dependencies` connect `Backend Dependencies` to `Backend Dependencies`, `Backend Dependencies`, `File Access Routes & Backup`, `Email & Push Notifications`, `Backend Dependencies`, `TOTP Two-factor Auth`, `Package Config & Nodemon`, `User Presence & Stale Sessions`, `Support Chat Data Flow (doc stages)`, `Backend Dependencies`, `Backend Dependencies`, `Backend Dependencies`, `Backend Dependencies`, `Backend Dependencies`, `Backend Dependencies`, `Backend Dependencies`, `Backend Tech Stack`, `Backend Dependencies`?**
  _High betweenness centrality (0.096) - this node is a cross-community bridge._
- **Why does `TravellineService` connect `Data Backfill & Travelline` to `Resolvers: representative, global, city, airport, log, airline`, `Global Resolvers & Logs`, `Server Entry & Auth Middleware`?**
  _High betweenness centrality (0.037) - this node is a cross-community bridge._
- **Are the 4 inferred relationships involving `prisma` (e.g. with `MongoDB ReplicaSet requirement` and `MongoDB Service (single node, replica set rs0)`) actually correct?**
  _`prisma` has 4 INFERRED edges - model-reasoned connections that need verification._