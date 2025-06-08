# PUT `/users/modify`

Updates the authenticated user's profile and optional avatar or banner image.

- **Authentication**: required JWT.
- **Rate Limit**: 8 requests per 30 minutes per IP (`modifyLimiter`).
- **Request Body**: multipart form fields
  - `displayName` – optional new display name
  - `bio` – optional new biography text
  - `avatar` – optional image file
  - `banner` – optional image file
- **Responses**:
  - `200` – JSON `{ user: { ... } }` with updated private profile.
  - `404` – user not found.
  - `401` – invalid token.

The endpoint uses a transaction to load the user, apply changes and upload files to GridFS. On success watchers are notified of the profile update.
