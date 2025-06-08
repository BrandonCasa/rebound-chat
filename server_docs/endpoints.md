# HTTP Endpoints

All API routes are served under the `/api` prefix. Authentication is handled via JWT in the `Authorization` header.

## Users

| Method | Path                                                       | Description                                                                                                                                                   |
| ------ | ---------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| POST   | [`/users/verify`](endpoints/users_verify.md)               | Validate a token and return authentication data.                                                                                                              |
| GET    | [`/users/profile`](endpoints/users_profile.md)             | When called by the owner, returns the private profile. When `?id=` is provided for another user, returns a public profile showing mutual friends and servers. |
| POST   | [`/users/login`](endpoints/users_login.md)                 | Log in with email and password. Returns authentication JSON.                                                                                                  |
| POST   | [`/users/register`](endpoints/users_register.md)           | Create a new account. Requires a password of at least eight characters.                                                                                       |
| PUT    | [`/users/modify`](endpoints/users_modify.md)               | Update display name, bio and optional avatar or banner image. Uses multipart form data.                                                                       |
| PUT    | [`/users/addfriend`](endpoints/users_addfriend.md)         | Send a friend request to another user.                                                                                                                        |
| PUT    | [`/users/acceptfriend`](endpoints/users_acceptfriend.md)   | Accept a pending friend request.                                                                                                                              |
| PUT    | [`/users/declinefriend`](endpoints/users_declinefriend.md) | Decline a pending friend request.                                                                                                                             |
| PUT    | [`/users/cancelfriend`](endpoints/users_cancelfriend.md)   | Cancel a sent friend request.                                                                                                                                 |
| PUT    | [`/users/removefriend`](endpoints/users_removefriend.md)   | Remove a confirmed friend from both parties.                                                                                                                  |

## Chat

| Method | Path                                                            | Description                                                |
| ------ | --------------------------------------------------------------- | ---------------------------------------------------------- |
| GET    | [`/rooms/:roomId/messages`](endpoints/rooms_roomId_messages.md) | Retrieve all messages in a room, ordered by creation time. |

## Admin

| Method | Path                                                           | Description                                            |
| ------ | -------------------------------------------------------------- | ------------------------------------------------------ |
| POST   | [`/admin/users/delete`](endpoints/admin_users_delete.md)       | Anonymise a user account and remove related data.      |
| POST   | [`/admin/friends/cleanup`](endpoints/admin_friends_cleanup.md) | Repair friend lists and remove orphan friend requests. |

## Development

These endpoints are only available when the server runs in development mode.

| Method | Path                                                           | Description                           |
| ------ | -------------------------------------------------------------- | ------------------------------------- |
| PUT    | [`/dev/database/wipe`](endpoints/dev_database_wipe.md)         | Delete all users, rooms and messages. |
| POST   | [`/dev/database/testroom`](endpoints/dev_database_testroom.md) | Create a test room and return its id. |

## Content

| Method | Path                                                  | Description                                      |
| ------ | ----------------------------------------------------- | ------------------------------------------------ |
| GET    | [`/content/:filename`](endpoints/content_filename.md) | Download a previously uploaded file from GridFS. |
