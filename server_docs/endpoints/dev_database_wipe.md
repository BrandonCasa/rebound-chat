# PUT `/dev/database/wipe`

Deletes all users, rooms and messages from the database.

- **Authentication**: none.
- **Rate Limit**: none.
- **Access**: only operates when `NODE_ENV` is `development`; otherwise returns `403`.
- **Responses**:
  - `200` – database cleared.
  - `403` – when called outside development mode.

Intended for local development to reset the database.
