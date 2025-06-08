# POST `/admin/friends/cleanup`

Synchronises friend lists and deletes orphan friend request documents.

- **Authentication**: none (endpoint is unsecured).
- **Rate Limit**: none.
- **Responses**:
  - `200` – cleanup completed.
  - `500` – on error.

Walks through all friend references, removing invalid ones and deleting friend records that are no longer referenced by any user.
