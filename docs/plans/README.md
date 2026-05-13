# Plans Index

This folder contains the active AWS-aligned planning set for the WebRTC migration.

## Active Plans

- `00-master-plan.md` - source of truth for migration baseline, completed phases, and remaining phases.
- `02-master-plan.md` - active dev-cutover execution slice (`us-east-2`).
- `03-plan-d-ecs-smoke.md` - tactical Plan D runbook for first API/worker image push and ECS smoke.

## Current Execution Status

- PR A ("CDK + Pipeline Correctness") remains implemented in-repo; the dev pipeline was rehydrated in `us-east-2` on May 13, 2026.
- PR B ("Server Runtime Dependencies + S3 Promotion") is implemented in-repo and locally verified.
- PR C ("LiveKit Token/Webhook Integration") is implemented in-repo and locally verified.
- PR D ("First Real Image Push + ECS Smoke") is in progress: API/worker images were pushed to ECR and task definitions were updated, but service desired counts remain `0` until production startup no longer depends on MongoDB/Mongoose.
- Current plan direction requires full removal of MongoDB/Mongoose/GridFS, Socket.IO runtime paths, EC2/PM2/Nginx deployment paths, and other legacy fallbacks as AWS-native replacements land.
- Next execution target is PR D ("First Real Image Push + ECS Smoke") unless data-cutover sequencing is pulled forward; the tactical runbook is now split into `03-plan-d-ecs-smoke.md`.

## Baseline and Supporting Docs

- `../adr/0001-aws-native-webrtc-platform.md` - accepted architecture baseline.
- `../prisma-stream-session-migration-note.md` - current scope of Prisma migration work.
- `../live-stream-viewer-metadata.md` - viewer metadata model and enhancement notes.
