# GET `/rooms/:roomId/messages`

Returns all messages in the specified room.

- **Authentication**: required JWT.
- **Rate Limit**: 3000 requests per minute per IP (`messagesLimiter`).
- **Path Parameters**:
  - `roomId` – ID of the room to retrieve messages from.
- **Responses**:
  - `200` – JSON `{ messages: [...], total: <count> }` sorted by creation time.
  - `404` – room not found.

Messages are populated with the sender's display name and avatar.
