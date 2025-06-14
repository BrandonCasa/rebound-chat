# GET `/users/google`

Initiates OAuth2 authentication with Google.

- **Authentication**: none.
- **Responses**: Redirects the user to Google's consent screen.

# GET `/users/google/callback`

Handles the OAuth2 callback. On success it redirects to the client root with a `token` query parameter containing the JWT.
