# GET `/dms/:userId/messages`

Return direct messages between the authenticated user and `userId`. Creates a new conversation if one does not exist.

- **Authentication**: required JWT.
- **Rate Limit**: 3000 requests per minute per IP (`messagesLimiter`).
- **Path Parameters**:
  - `userId` – ID of the other participant.
- **Responses**:
  - `200` – JSON `{ threadId: <id>, messages: [...] }` sorted by creation time.
  - `404` – other user not found.

# POST `/dms/:userId/messages`

Send a direct message to `userId`.

- **Authentication**: required JWT.
- **Request Body**:
  ```json
  { "content": "Hello" }
  ```
- **Responses**:
  - `200` – JSON `{ threadId: <id>, messages: [...] }` updated list.
  - `404` – other user not found.
