# PUT `/users/declinefriend`

Declines a pending friend request.

- **Authentication**: required JWT.
- **Rate Limit**: 100 requests per 15 minutes per IP (`generalLimiter`).
- **Request Body**:
  ```json
  { "friendId": "<id>" }
  ```
- **Responses**:
  - `200` – request declined and removed.
  - `401` – if the requester is not the recipient.
  - `404` – request not found.

Internally `declineFriend` removes the Friend document and references from both users.
