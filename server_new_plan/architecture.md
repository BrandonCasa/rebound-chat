# Target Backend Architecture (NestJS + GraphQL)

## Domain Modules (initial set)
- **Auth Module**: JWT/refresh tokens, OAuth (Google), CSRF protection for browser clients, role/permission guards, session-less GraphQL context injection.
- **Users Module**: Profiles, avatars (S3), friends/blocks, presence status, notification preferences, audit logs for PII access.
- **Servers/Rooms Module**: Server ownership/moderation, room membership, invites, channel types (text/voice placeholder), permissions matrix, role-based access checks.
- **Chat/Message Module**: Message CRUD, attachments (S3), reactions, threaded replies, pagination, search hooks, content moderation pipeline.
- **DM Module**: DM threads, participants, read receipts, typing indicators, push notification hooks.
- **Content/Media Module**: Upload/download via presigned URLs, virus scanning hooks, image processing, CDN-aware URL generation, signed URLs for private assets.
- **Admin/Dev Tools Module**: Feature flags, health checks, rate-limit dashboards, background jobs for data migrations and cleanups.

## Application Layers
- **GraphQL API**: Apollo driver (code-first), schema-first outputs for tooling; resolvers per module; subscriptions for message/presence updates; no REST compatibility surface.
- **Gateway Layer**: Nest WebSockets gateway backed by Redis adapter; shared message contract with GraphQL subscriptions; supports future federation/microservices.
- **Persistence Layer**: Prisma with PostgreSQL; domain repositories per module; migration history stored in `prisma/migrations`; optional read-only Mongo adapter for legacy reads during transition.
- **Caching & Queueing**: Redis for caching, rate limiting, dataloaders, pub/sub; background worker using Nest Queues (BullMQ) for media processing and email/notification jobs.
- **Shared Types Package**: `packages/types` exported via pnpm workspace for DTOs, GraphQL models, validation schemas, and generated client types for the frontend.

## Microservice-Friendly Layout
- Start as **modular monolith**: one Nest app with clearly separated modules, message contracts, and interfaces.
- Identify future service boundaries:
  - Auth/Identity
  - Chat/Realtime
  - Media/Attachments
  - Admin/Reporting
- Prepare messaging contracts (Proto/JSON schema) and internal SDK so services can be extracted without rewriting modules.
- Use API Gateway/Ingress (Cloudflare + reverse proxy) to route to services when split occurs.

## GraphQL Patterns
- Use **class-validator**/**class-transformer** DTOs for args/input types; enforce strict validation and authorization guards.
- Adopt **dataloaders** per request for user/message lookups to reduce N+1.
- Versioned schema via CI check; publish schema to registry for frontend codegen.
- Pagination: cursor-based for messages/rooms; limit-based for admin lists.
- Error handling: map domain errors to GraphQL errors with extensions (codes, retryable hints).

## Security & Compliance
- Store secrets via env + vault integration; rotate keys regularly.
- PII handling: minimize selection, encrypt sensitive columns (e.g., refresh tokens, invite codes), audit access.
- Rate limiting/slowdowns via Nest Guards + Redis tokens; WebSocket message throttling.
- Input sanitization for chat content; content moderation pipeline (detectors + manual review hooks).
- Logging policy: redact tokens/passwords; structured JSON logs; trace IDs propagated through WebSockets/HTTP.

## Migration Interfaces
- **Dual-write adapters** for critical entities (Users, Messages) until Mongo decommissioned.
- **ID mapping table** to map Mongo ObjectIds to SQL UUIDs; expose lookup utility for resolvers and websocket payloads.
- **Backfill jobs** packaged as Nest commands (via `@nestjs/cli` custom commands) or worker queues.

## Frontend Contract Support
- Generate **GraphQL typed client** (e.g., via `graphql-codegen`) exported to the React app to drive the new frontend.
- Shared validation schemas for forms (e.g., Zod or class-validator-derived) exposed through workspace package.
- Feature flags to roll out GraphQL usage per feature to reduce regressions.

## Observability
- OpenTelemetry tracing with HTTP/WebSocket instrumentation; exporters for Jaeger/OTLP.
- Metrics via Prometheus + NestJS meters; dashboards for request rates, resolver latency, pub/sub throughput.
- Log correlation with Cloudflare request IDs.
