# GET `/content/:filename`

Downloads a file stored in GridFS.

- **Authentication**: none.
- **Rate Limit**: 50 requests per minute per IP (`downloadLimiter`).
- **Path Parameters**:
  - `filename` – sanitized filename of the stored file.
- **Responses**:
  - `200` – file stream with appropriate content type.
  - `400` – invalid filename.
  - `404` – file not found.
  - `503` – if the file store is not ready.

The filename is validated against a whitelist of characters and served directly from GridFS.
