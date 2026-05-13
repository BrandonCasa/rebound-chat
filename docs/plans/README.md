# Plans Index

This folder contains the active AWS-aligned planning set for the WebRTC migration.

## Active Plans

- `00-master-plan.md` - source of truth for migration baseline, completed phases, and remaining phases.
- `02-master-plan.md` - active dev-cutover execution slice (`us-east-2`).

## Current Execution Status

- PR A ("CDK + Pipeline Correctness") is implemented in-repo and locally verified.
- Next execution target is PR B ("Server Runtime Dependencies + S3 Promotion").

## Baseline and Supporting Docs

- `../adr/0001-aws-native-webrtc-platform.md` - accepted architecture baseline.
- `../prisma-stream-session-migration-note.md` - current scope of Prisma migration work.
- `../live-stream-viewer-metadata.md` - viewer metadata model and enhancement notes.
