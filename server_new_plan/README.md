# NestJS Migration Overview

This folder captures the high-level migration strategy for moving the Rebound backend to NestJS with GraphQL while preparing for SQL storage, AWS S3 media, Cloudflare/CDN, and microservice-friendly patterns. It reflects current behavior in `server/src` (Express + MongoDB + Socket.IO) and frontend needs in `src`.

## Objectives
- Replatform backend to **NestJS (TypeScript)** using **GraphQL (code-first)** and shared DTO/types for frontend consumption.
- Gradually replace MongoDB/GridFS with **SQL (PostgreSQL preferred)** plus S3 for media, preserving data integrity during transition.
- Maintain real-time chat/DM functionality (currently via Socket.IO) with scalable Nest-native transport (e.g., WebSockets gateway, optional Redis adapter).
- Improve security posture (JWT, OAuth, CSRF, rate limiting, validation) to industry standards and align with Cloudflare/CDN usage.
- Prepare CI/CD and GitHub Actions for linting, testing, schema checks, and deployment to the new stack.

## Migration Phases (broad scope)
1. **Foundation (NestJS bootstrap)**
   - [x] Create Nest workspace with pnpm; set up ESLint/Prettier aligned with repo style.
   - [x] Add GraphQL (Apollo driver) with code-first schema generation and automatic schema artifact publishing.
   - [ ] Establish shared `@rebound/types` package for DTOs/entities used by frontend (exported via pnpm workspace).
   - [x] Wire configuration module (env validation, per-environment files) and logging (Nest Logger + Winston bridge).

2. **Auth & User Domain parity**
   - [ ] Rebuild authentication/authorization (JWT access/refresh, optional OAuth providers) mirroring current `auth.js` behavior (cookie + bearer token handling).
   - [ ] Add CSRF strategy for web clients (align with existing CSRF cookie/header) and session-less guards for GraphQL context.
   - [ ] Migrate User model (profiles, avatars, friends) from Mongo to SQL with migration scripts and data seeding.

3. **Chat/DM/Content features**
   - [ ] Implement GraphQL modules for Rooms, Messages, DM threads, Server/Channel constructs with pagination and real-time updates (Subscriptions/WebSockets gateway + Redis adapter).
   - [ ] Replace GridFS uploads with S3-backed media service; preserve metadata links and add presigned URL flows for client uploads/downloads.
   - [ ] Add rate limiting/throttling similar to `chat.js` limiter but via Nest Guard/interceptor.

4. **Database migration to SQL**
   - [ ] Introduce PostgreSQL via Prisma or TypeORM (prefer Prisma for schema evolution + type-safety); create interim dual-write/read adapters until Mongo is retired.
   - [ ] Design migration plan for collections (Users, Rooms, Messages, DmThreads, ServerInvite, etc.) including ID mapping and referential integrity.
   - [ ] Provide backfill scripts and cutover steps; schedule read-only window or live dual-write with reconciliation checks.

5. **Infrastructure & Observability**
   - [ ] Containerize Nest services (Dockerfile + multi-stage) and define Kubernetes/Helm-ready manifests for microservice boundaries.
   - [ ] Add centralized logging/metrics/tracing (OpenTelemetry + exporter) and structured audit logs for auth/content events.
   - [ ] Configure Cloudflare (TLS, WAF rules, caching headers) and CDN asset rules for S3-hosted media.

6. **CI/CD & Developer Experience**
   - [ ] Update GitHub Actions to build/test Nest apps, run GraphQL schema diffing, lint, and publish packages to npm registry or GitHub Packages.
   - [ ] Add e2e test harness (Jest + Supertest/GraphQL testing) and contract tests for Socket/WebSocket flows.
   - [ ] Provide local dev scripts (pnpm) and mocks for S3/Cloudflare (e.g., LocalStack/MinIO) plus database seeders.

## Progress (this iteration)

- Bootstrapped `server_new_impl` Nest app with GraphQL, validated configuration, and security middleware (helmet/CORS/validation pipe).
- Added `Health` GraphQL resolver for liveness checks and initial `Users` module with a schema-level lookup stub to unblock frontend contracts.

## Next considerations

- Replace the in-memory `UsersService` placeholder with Prisma-backed PostgreSQL access and add dataloaders for relation-heavy queries.
- Introduce authentication/authorization guards around user lookups before exposing broader profile fields.
- Stand up the shared `@rebound/types` package so the frontend can adopt generated types without coupling to Nest internals.

## Notes & Considerations
- **API surface:** Go fully GraphQL-first (plus WebSockets for realtime) and deprecate the legacy REST surface as the frontend is modernized.
- **Real-time:** Replace Socket.IO server with Nest WebSockets; consider message broker (Redis or NATS) to scale horizontally and coordinate presence/typing indicators.
- **Security:** Enforce input validation (class-validator), sanitized file handling, strict CORS, and secrets rotation; adopt HTTP-only cookies for refresh tokens with short-lived access tokens in headers.
- **Performance:** Introduce dataloaders for batching GraphQL requests (users, rooms, messages), caching layers (Redis) for frequently read queries, and CDN caching for public media.
- **Compatibility:** Mirror current rate limits (global + per-route) and CSRF approach to avoid regressions while clients transition.
- **Observability:** Maintain parity with existing logging (`server/src/logger.js`) by mapping levels/structures; plan log schema for new services.

## Deliverables for this planning stage
- This `server_new_plan` directory with architectural notes and TODOs.
- Follow-up tasks will create initial Nest workspace, shared types package, and migration utilities before touching production traffic.
