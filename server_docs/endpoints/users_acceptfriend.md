# PUT `/users/acceptfriend`

Accepts a pending friend request.

- **Authentication**: required JWT.
- **Rate Limit**: 100 requests per 15 minutes per IP (`generalLimiter`).
- **Request Body**:
  ```json
  { "friendId": "<id>" }
  ```
- **Responses**:
  - `200` – friend request confirmed.
  - `403` – if already confirmed.
  - `401` – if the requester is not the recipient.
  - `404` – request not found.

Only the recipient of the request may call this endpoint. The `confirmed` flag is set on the friend document.
