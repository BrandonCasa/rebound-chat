# POST `/users/verify`

Validates a JWT sent in the `Authorization` header and returns authentication data for the associated user.

- **Authentication**: JWT in the header using `Token` or `Bearer` scheme.
- **Rate Limit**: 100 requests per 15 minutes per IP (`generalLimiter`).
- **Request Body**: none. Token is read from the header.
- **Responses**:
  - `200` – JSON `{ user: { ... } }` containing a fresh token and profile fields.
  - `401` – invalid token or deactivated account.

Internally the endpoint decodes the token with the server secret, loads the user and ensures the account is active.
