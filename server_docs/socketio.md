# Socket.IO Events

Connections are established to port `6002` using the standard Socket.IO client. Clients must provide a JWT in the `Authorization` header during the WebSocket handshake.

After a successful connection the server emits:

- `connected` – indicates the socket is authenticated.

## Chat Rooms

Client‑initiated events handled in `server/src/socketio/rooms.js`:

| Event | Arguments | Description |
|-------|-----------|-------------|
| `list_rooms` | – | Request the list of available chat rooms. Server replies with `room_list`. |
| `make_room` | `name`, `description` | Create a new chat room. Server replies with `room_created`. |
| `join_room` | `roomId` | Join an existing room. Server emits `joined_room` with the room id and message history and broadcasts `user_list` to all sockets in the room. |
| `leave_room` | `roomId?` | Leave a specific room or all joined rooms. |
| `message_room` | `roomId`, `content` | Send a message to a room. Sender receives `message_sent`; others get `new_message`. |
| `edit_message` | `roomId`, `messageId`, `content` | Edit a previously sent message. Room participants receive `messages_updated`. |
| `delete_message` | `roomId`, `messageId` | Delete one of the sender's messages. Room participants receive `messages_updated`. |

Server‑emitted events related to rooms:

- `room_list` – `[idToName, idToRoom]` object when listing rooms.
- `room_created` – newly created room id.
- `joined_room` – room id and full message list when a socket joins.
- `left_room` – confirmation that the socket left a room.
- `user_list` – `roomId`, array of user profiles, joining/leaving user's profile and action (`"join"` or `"leave"`).
- `message_sent` – updated message list sent back to the sender after posting.
- `new_message` – updated messages broadcast to others in the room.
- `messages_updated` – emitted after edits or deletions.

## Watchers

Handlers in `server/src/socketio/watchers.js` let sockets watch user profiles for changes.

| Event | Arguments | Description |
|-------|-----------|-------------|
| `watch_user` | `userId` | Start receiving updates when that user's profile changes. |
| `unwatch_user` | `userId` | Stop watching a user. |

When a watched user saves changes, the server emits to each watcher:

- `watched_user_saved` – `[userId, publicInfo, privateInfo]` where `publicInfo` contains the public profile fields computed for the watcher and `privateInfo` contains private fields only if the watcher is the owner.

