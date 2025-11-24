# Chat scrolling lifecycle

This document captures the core event flow that powers chat scrolling, pagination, and scroll position management.

## Components and hooks involved
- `src/components/Chat/ChatArea.jsx` owns the scrollable container and wires scroll events to the chat logic.
- `src/routes/ChatPage/hooks/useChatMessages.js` manages pagination state, scroll locking, and scroll position adjustments.
- `src/routes/ChatPage/hooks/useRoomLifecycle.js` and `src/routes/ChatPage/hooks/useChatSockets.js` keep the scroll position aligned during room switches and live updates.

## Scroll event pipeline
1. **Scroll container setup**: `ChatArea` renders the list inside an absolutely positioned box with `overflowY: auto`. It registers a `scrollend` listener and polyfills the event by debouncing native `scroll` events when the browser lacks `onscrollend`. The hook-provided `onScroll` handler only runs on `scrollend`, keeping pagination logic centralized.
2. **Scroll-end handling**: `useChatMessages.handleScroll` receives the `scrollend` event. When a fetch is in flight it clamps the scrollbar to the last locked position so repeated events cannot retrigger pagination. Otherwise, it checks whether the top threshold (`SCROLL_TRIGGER_PX`) has been crossed while more history is available. Crossing the threshold locks the scroll position to that threshold, updates the DOM scrollTop to match, and starts loading older messages.

## Loading older pages
1. **Entering the loading state**: `fetchOlderMessages` short-circuits if another fetch is in progress or no older history exists. It tracks the `_id` of the requested page (`nextBefore`) to prevent duplicate requests. Scroll locking is applied immediately so the user cannot scroll past the trigger point while the request is pending.
2. **Skeleton placeholders**: When a load is triggered, a batch of top-of-list skeletons renders (`loadingSkeletonCount`), giving visual feedback while the request resolves.
3. **Maintaining scroll anchoring**: Before the request, the hook captures `scrollHeight` and `scrollTop`. After the skeletons render and again after real messages arrive, it recomputes the target `scrollTop` to preserve the user’s anchored position relative to the newly inserted content. The lock is updated to that computed position so subsequent `scrollend` events cannot drift.

## Initial room load and switching
- `useRoomLifecycle` clears pagination state and messages whenever the current room changes. It scrolls to the bottom on room entry and when no room is selected, preventing double-loads caused by stale scroll positions. The first fetch for a room runs only once per room to avoid duplicate pagination calls.

## Live message updates
- `useChatSockets` merges incoming messages into the list and, when the user is already near the bottom, schedules a scroll-to-bottom so new messages remain visible without disrupting pagination state. It also updates paging metadata so the scroll logic knows when more history is available.

## Scroll position enforcement
- `scrollToBottom` writes `scrollTop` to `scrollHeight` inside an animation frame, ensuring layout is ready. Scroll locking stores the last authoritative `scrollTop` and re-applies it whenever `scrollend` fires during loading, keeping the visible scrollbar aligned with the code’s expected position.
