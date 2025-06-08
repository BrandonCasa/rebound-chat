# Architecture Overview

The server runs an HTTP API alongside a Socket.IO real‑time service. It uses a MongoDB database with GridFS for storing uploaded files. The entry point is `server/src/app.js`.

1. **Database Connection** – the server connects to MongoDB using Mongoose. In development a temporary in‑memory replica set is started. When the database connection opens, a `GridFSBucket` is created for file uploads.
2. **Express Application** – middleware includes CORS handling, body parsing and method override support. A global limiter caps every IP at 150 requests per five minutes with additional per‑route limiters. Passport is configured with a local strategy for logins.
3. **Routing** – all API routes are mounted under `/api`. File downloads are served from `/content/:filename`.
4. **Socket.IO** – a separate Socket.IO instance listens on port `6002`. JWT tokens are validated during the WebSocket handshake. When a client connects the server wires up chat room and watcher handlers and emits a `connected` event.
5. **Graceful Shutdown** – `ServerBackend` exposes `startBackend`, `stopBackend` and `handleShutdown` to close the Socket.IO server, database and HTTP server in order.

