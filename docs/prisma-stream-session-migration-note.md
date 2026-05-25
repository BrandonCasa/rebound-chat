# Prisma Stream Session Boundary

This migration slice introduces Prisma only for the planned Aurora PostgreSQL stream-session data layer. Mongoose remains the active production backing store.

Included in this slice:

- Draft Prisma models for stream sessions, stream assets, and participant telemetry summaries.
- A lazy Prisma client helper that requires `DATABASE_URL` only when Prisma-backed code paths are used.
- A stream-session repository boundary and mapper that can expose current Mongo session documents in a transport-aware shape.

Explicitly not migrated in this slice:

- Login and registration.
- Users and auth sessions.
- Chat messages, rooms, DMs, friends, and invites.
- GridFS media storage.
- Existing HLS live ingest, playback, uploader, and cleanup behavior.
