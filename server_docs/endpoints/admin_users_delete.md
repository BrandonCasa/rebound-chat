# POST `/admin/users/delete`

Anonymises a user account and cleans up related data.

- **Authentication**: none (endpoint is unsecured).
- **Rate Limit**: none.
- **Request Body**:
  ```json
  { "userId": "<id>" }
  ```
- **Responses**:
  - `200` – user anonymised and related references removed.
  - `500` – on error.

Operations are performed inside a transaction: friend documents and server invites are cleaned, server ownership is transferred and the user record is anonymised.
