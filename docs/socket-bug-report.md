# Socket Implementation Bug Review

## Frontend

- `updatePageInfo` stores the active channel ID under `pageInfoRef.current.channel`, but the fallback uses `pageInfoRef.current.roomIdOut` instead of `pageInfoRef.current.channel`. Once invoked without a `roomIdOut`, this sets `channel` to `undefined`, which can break pagination (e.g., `fetchOlderMessages` falls back to `pageInfoRef.current.channel` and would stop loading older messages even after a successful join).【F:src/routes/ChatPage/useChatPage.js†L45-L87】

- `connectSocket` reuses any existing connected socket without checking whether the configured `socketURL` changed. If the URL is updated (for example, switching environments), the thunk will keep using the old connection instead of reconnecting to the new endpoint, leading to events going to the wrong server.【F:src/slices/socketSlice.js†L46-L66】

## Backend

- Room messaging does not verify membership before accepting `message_room` events. Any authenticated socket can emit `message_room` to an arbitrary `roomId` and the server will append and broadcast the message even if the sender never joined the room. This bypasses the join/leave flow and could leak presence or allow spam into restricted rooms.【F:server/src/socketio/rooms.js†L124-L204】

- `getSocketsInRoom` assumes every connected socket’s user ID resolves to a valid document. If a user is deleted while still connected, `UserModel.findById(...).toProfilePubJSON` will throw, failing the entire fetch and breaking join/leave broadcasts for the room.【F:server/src/socketio/index.js†L77-L86】
