# POST `/dev/database/testroom`

Creates a test chat room and returns its identifier.

- **Authentication**: none.
- **Rate Limit**: none.
- **Access**: only operates when `NODE_ENV` is `development`; otherwise returns `403`.
- **Responses**:
  - `200` – JSON `{ roomId: "<id>" }` when created.
  - `403` – when called outside development mode.

Used for development to seed a sample chat room.
