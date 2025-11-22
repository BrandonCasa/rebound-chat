# Frontend Behavior Snapshot (for NestJS + Microservices Planning)

This summarizes what the current React frontend implements so backend service boundaries can mirror real feature needs. It ignores transport/protocol specifics and focuses on behaviors/data.

## Global shell & auth flows
- `App.jsx` sets up routing for landing, chat, friends, profile, servers (WIP), DMs, settings, and testing routes.
- Auth tokens are pulled from a `token` query param on load and stored in `localStorage`; the app immediately verifies tokens and greets the user via snackbars on success, or clears state on failure.
- Socket connections are opened once a user is logged in, with status tracking and cleanup on unmount.

## Chat rooms (multi-user)
- `ChatPage` renders channel selection, a member list popover, message list, and composer.
- `useChatPage` handles room discovery, joining/leaving rooms, message send/edit/delete, mention parsing, per-room message history fetches, and member list updates via socket events and REST fetches.
- User preview popovers fetch full profiles before showing avatars/banners.

## Direct messages
- `DirectMessagePage` opens a DM thread based on route params; it loads the other user’s profile and uses sockets to join a DM room, send/edit/delete messages, and stream updates.
- Thread IDs are derived from the backend; the page fetches historical messages and supports mentions within DMs.

## Friends & social graph
- `FriendPage` lists confirmed and pending relations with statuses (friends/sent/received), profile preview popovers, and navigation into DM threads.
- `useFriendPage` loads the signed-in user’s relations, resolves counterpart profiles, watches for profile updates over sockets, and issues friend actions (accept/decline/cancel) with optimistic UI removal.

## Profiles & media hints
- Profile data includes display name, username, bio, avatar, banner, creation timestamp, and friends list; avatars/banners are resolved via helper URLs that fall back to defaults.
- Profile modification uses multipart form data for uploads, implying future S3-backed media handling.

## Other surfaces
- Servers page is placeholder cards, implying planned server/channel discovery UX.
- Call overlay, settings, and testing routes exist in the shell, signaling future RTC/settings coverage.

## Microservice boundary cues from frontend needs
- **Identity & Profiles:** account registration/login, token verification, profile fetch/update, avatar/banner media processing.
- **Social Graph:** friend request lifecycle, presence of watchers for profile changes, and relation status computation.
- **Guild/Rooms:** room list discovery, join/leave flows, message CRUD with mentions, member lists, and per-room state.
- **Direct Messaging:** thread lookup/creation, message CRUD, mentions, and per-thread presence/typing hooks.
- **Media:** avatar/banner storage and URL signing for uploads/previews.
- **Realtime Gateway:** socket lifecycle, room/DM event fan-out, and notification/snackbar hooks on joins/leaves.
