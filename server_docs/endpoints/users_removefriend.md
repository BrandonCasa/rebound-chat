# PUT `/users/removefriend`

Removes an existing confirmed friend from both users' lists.

- **Authentication**: required JWT.
- **Rate Limit**: 100 requests per 15 minutes per IP (`generalLimiter`).
- **Request Body**:
  ```json
  { "friendId": "<id>" }
  ```
- **Responses**:
  - `200` – friend relationship removed.
  - `403` – if the request is not confirmed.
  - `401` – if neither party matches the authenticated user.
  - `404` – request not found.

The helper `removeFriend` verifies the caller and deletes the friend document.
