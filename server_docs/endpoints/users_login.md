# POST `/users/login`

Authenticates a user with email and password using Passport's local strategy.

- **Authentication**: none. Credentials are provided in the body.
- **Rate Limit**: 20 requests per hour per IP (`authLimiter`).
- **Request Body**:
  ```json
  {
    "user": {
      "email": "user@example.com",
      "password": "secret"
    }
  }
  ```
- **Responses**:
  - `200` – JSON `{ user: { ... } }` containing an auth token on success.
  - `422` – when credentials are missing or invalid.

The route delegates to Passport which returns the user's `toAuthJSON()` on successful authentication.
