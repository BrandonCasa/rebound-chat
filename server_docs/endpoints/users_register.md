# POST `/users/register`

Creates a new user account.

- **Authentication**: none.
- **Rate Limit**: 20 requests per hour per IP (`authLimiter`).
- **Request Body**:
  ```json
  {
  	"user": {
  		"username": "name",
  		"email": "user@example.com",
  		"displayName": "Name",
  		"bio": "Optional bio",
  		"password": "atLeast8Chars"
  	}
  }
  ```
- **Responses**:
  - `200` – JSON `{ user: { ... } }` including a JWT.
  - `422` – when validation fails (e.g. short password or duplicate fields).

A new `User` document is created and `setPassword` hashes the password. The returned object includes the authentication token via `toAuthJSON()`.
