# PUT `/users/addfriend`

Sends a friend request from the authenticated user to another user.

- **Authentication**: required JWT.
- **Rate Limit**: 100 requests per 15 minutes per IP (`generalLimiter`).
- **Request Body**:
  ```json
  { "recipientId": "<userId>" }
  ```
- **Responses**:
  - `200` – JSON `{ friendId: "<id>" }` when the request is created.
  - `403` – if the recipient blocked the sender or a request already exists.
  - `404` – if either user does not exist.
  - `401` – on invalid token.

Uses `sendFriendRequest` to validate users and create the `Friend` document.
