# GET `/users/profile`

Returns a user's profile. The behaviour depends on the authenticated user and optional query parameter `id`.

- **Authentication**: required JWT (`auth.required`).
- **Rate Limit**: 100 requests per 15 minutes per IP (`generalLimiter`).
- **Query Parameters**:
  - `id` – if provided and not equal to the authenticated user, returns the public profile for that user. Otherwise returns the private profile of the requester.
- **Responses**:
  - `200` – JSON `{ user: { ... } }` with either public or private fields.
  - `404` – user not found.
  - `401` – invalid token.

Profiles are generated via `toProfilePrivJSON` or `toProfilePubJSON` which include mutual friends and servers when applicable.
