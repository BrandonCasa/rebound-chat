# Infrastructure, CI/CD, and Data Migration Notes

## Cloud & Networking
- **Cloudflare integration**: terminate TLS, enable WAF/Rate Limiting, and cache public assets (S3-hosted) with aggressive cache-control. Use cache bypass for authenticated GraphQL/REST routes and WebSocket upgrade rules for realtime traffic.
- **CDN strategy**: signed URLs for private media; immutable caching for public thumbnails; configure image resizing at edge (Cloudflare Images or Workers) where possible.
- **Ingress**: adopt reverse proxy (NGINX/Traefik) rules compatible with Nest + WebSockets; include health probes for liveness/readiness.

## Storage & Data
- **PostgreSQL**: primary data store; use managed service where possible. Enable PITR, encryption at rest, and connection pooling (pgBouncer) to support microservices.
- **MongoDB deprecation**: keep read-only adapters for rollback; schedule data freeze or dual-write. Archive GridFS assets before S3 cutover.
- **AWS S3**: buckets per environment with lifecycle rules (infrequent access, deletion), server-side encryption (SSE-S3/KMS), and presigned URL flows for uploads/downloads.
- **Media processing**: queue-based processing (BullMQ) for virus scanning, thumbnailing, image optimization; store processed variants with deterministic keys.

## CI/CD (GitHub Actions)
- Add **pnpm + Node** setup for Nest workspace, run `pnpm lint`, `pnpm test`, and `pnpm build` for affected packages.
- Include **GraphQL schema check** job (generate schema and diff against main branch artifact).
- Add **Prisma/TypeORM migration check** (`pnpm prisma migrate diff` or equivalent) to ensure migrations committed.
- Build/push Docker images per service/module; sign images (cosign) and attach SBOMs.
- Secrets management via GitHub OIDC to cloud provider; avoid long-lived secrets in workflows.

## Deployment Model
- **Environments**: dev/stage/prod with separate databases/buckets and feature flags; infrastructure-as-code (Terraform) to manage resources.
- **Microservices path**: start with single deployment; when splitting, deploy independent services behind Cloudflare with service discovery (Kubernetes or ECS). Shared types package must be versioned and published.
- **Blue/Green or Canary** for breaking changes (e.g., GraphQL schema evolutions, DB migrations) using traffic shifting.
- **Zero-downtime migrations**: additive DB changes first, backfill jobs, then cleanup; maintain compatibility with running app versions.

## Security & Compliance Checklist
- [ ] Secrets via env vault; rotate JWT/refresh secrets; enforce strong cipher suites.
- [ ] Content Security Policy and strict CORS configuration aligned with frontend domains.
- [ ] Audit logging for admin actions and PII access; log redaction pipeline.
- [ ] Data retention policies for messages/media; GDPR/CCPA data export/delete flows.
- [ ] Automated dependency scanning and container scanning in CI.

## Developer Experience
- Local stack: Docker Compose with PostgreSQL, Redis, LocalStack/MinIO for S3, and optional in-memory Mongo snapshot for backfills.
- Scripts: `pnpm dev:api` (Nest), `pnpm dev:worker`, `pnpm dev:web`; seed scripts for demo data aligned with fixtures.
- Documentation: ADRs for key choices (Prisma vs TypeORM, Redis adapter selection), and runbooks for backfills and incident response.
