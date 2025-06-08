# PUT `/users/cancelfriend`

Cancels a friend request previously sent by the authenticated user.

- **Authentication**: required JWT.
- **Rate Limit**: 100 requests per 15 minutes per IP (`generalLimiter`).
- **Request Body**:
  ```json
  { "friendId": "<id>" }
  ```
- **Responses**:
  - `200` – request cancelled and removed.
  - `401` – if the requester is not the sender.
  - `403` – if the request has already been confirmed.
  - `404` – request not found.

Uses `cancelFriend` to remove the Friend document from both users.
