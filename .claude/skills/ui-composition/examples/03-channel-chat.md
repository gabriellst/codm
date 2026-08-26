# Example 03 — Channel / Chat (WhatsApp)

> Worked output for `routes/(app)/channel/chat/` on `dev`. Shows: 3-column master/detail layout, deep Section nesting (ChatPanel orchestrates 6 sub-components), multiple Dialogs both shared and route-local, Zustand store for ephemeral state, realtime hooks, search overlay.

**Source screen:** `packages/app/react/src/routes/(app)/channel/chat/` (full tree)

---

## UI Composition

### URL Contract

- **Path:** `/(app)/channel/chat/`
- **Breadcrumb:** `WhatsApp` (custom)
- **Search params (Zod sketch):**
  - `chatId` — `z.string().optional()` — drives the selected conversation (master/detail)
- **Loader:** `channel` parent route resolves `channelId` via `getChannelChannelsResolveQueryOptions` and exposes through `useLoaderData()`
- **errorComponent:** `RouteError`
- **wrapperClassName:** `h-full w-full` (full-height layout, no padding)

### ASCII Layout Map

```text
┌────────────────────────────────────────────────────────────────────────────┐
│ Route Shell — h-full w-full container                                      │
├────────────┬───────────────────────────────────────────┬───────────────────┤
│ ChatSidebar│ ChatPanel                                 │ PatientInfoPanel  │
│            │ ┌───────────────────────────────────────┐ │   OR              │
│  Connection│ │ ChatHeader                            │ │ GroupInfoPanel    │
│  Badge     │ ├───────────────────────────────────────┤ │   OR              │
│            │ │ MessageList                           │ │ ConnectionPanel   │
│  ┌──────┐  │ │  MessageBubble (Leaf ×N)              │ │                   │
│  │Chat  │  │ ├───────────────────────────────────────┤ │   (one of three,  │
│  │ListI │  │ │ MessageComposer                       │ │    by chat type / │
│  │tem×N │  │ └───────────────────────────────────────┘ │    connection)    │
│  └──────┘  │                                           │                   │
│            │ SearchOverlay (Component, conditional)    │ AgentConfigPopover│
│            │                                           │   (Component)     │
└────────────┴───────────────────────────────────────────┴───────────────────┘

Overlays (mounted via useDialogStore):
  InstanceManagementDialog (Dialog, route-local)
    └─ opens from ChatSidebar "manage" action
  SendMediaDialog (Dialog, route-local)
    └─ opens from MessageComposer attachment menu
  ForwardMessageDialog (Dialog, route-local)
    └─ opens from MessageBubble action
  CreatePatientDialog (Dialog, shared @/components/Dialogs)
    └─ opens from PatientInfoPanel when chat is unlinked
  ConfirmDialog (Dialog, generic via useDialogStore.confirm)
    └─ inline confirmation for destructive actions (delete message, etc.)
```

### Component Tree

```text
ChatRoute                                                  (Route Shell, h-full w-full)
├─ ChatSidebar                                             (Section, owns sidebar query)
│  ├─ ConnectionBadge                                      (Component, reads useChannelSyncState)
│  ├─ ChatListItem                                         (Leaf ×N)
│  │  └─ ChatRowContextMenu                                (Component, opens dialogs)
│  └─ (mounts InstanceManagementDialog on action)
├─ ChatPanel                                               (Section, orchestrates ≥6 sub)
│  ├─ ChatHeader                                           (Component, chat info + actions)
│  ├─ MessageList                                          (Section, owns useListChatMessages)
│  │  ├─ MessageBubble                                     (Leaf ×N)
│  │  │  ├─ HighlightedText                                (Component, search match)
│  │  │  ├─ QuotedReply                                    (Component, conditional)
│  │  │  └─ MessageActions                                 (Component, opens dialogs)
│  │  └─ MediaPreview / MediaLightbox                      (Component, conditional)
│  ├─ MessageComposer                                      (Component, owns send mutation)
│  │  └─ AttachmentMenu                                    (Component, opens SendMediaDialog)
│  ├─ SearchOverlay                                        (Component, conditional)
│  └─ (mounts SendMediaDialog, ForwardMessageDialog, ConfirmDialog on actions)
└─ (right-column — one of three, by chat type)
   ├─ PatientInfoPanel                                     (Section, owns useGetPatient)
   │  └─ AgentConfigPopover                                (Component)
   ├─ GroupInfoPanel                                       (Section, group chat metadata)
   └─ ConnectionPanel                                      (Section, when connection severed)

Overlays:
├─ InstanceManagementDialog                                (Dialog, route-local)
│  ├─ OverviewTab                                          (Component)
│  └─ ProfileTab                                           (Component)
├─ SendMediaDialog                                         (Dialog, route-local, contains Form)
├─ ForwardMessageDialog                                    (Dialog, route-local, contains Form)
├─ CreatePatientDialog                                     (Dialog, shared @/components/Dialogs/)
└─ ConfirmDialog                                           (generic, via useDialogStore.confirm())
```

### Data Cards

| Name | Role | Data | URL r/w | Store r/w | Local | Reuse | File | Skill |
|---|---|---|---|---|---|---|---|---|
| ChatRoute | RouteShell | — (parent route loads `channelId`) | declares: `chatId` | `useChatStore: { writes: channelId from loader, chatLimit init }` | — | create-route-local | `routes/(app)/channel/chat/route.tsx` | /route |
| ChatSidebar | Section | `useGetChannelSidebar({ channelId, limit: chatLimit })` | reads: `chatId` | `useChatStore: { reads: channelId, chatLimit }` | — | create-route-local | `routes/(app)/channel/chat/-components/ChatSidebar/` | /component |
| ConnectionBadge | Component | `useChannelSyncState(channelId)` | — | `useChatStore: { reads: channelId }` | — | create-route-local | `routes/(app)/channel/chat/-components/ConnectionBadge/` (or under ChatSidebar) | /component |
| ChatListItem | Leaf | props from ChatSidebar | writes: `chatId` (on click) | — | — | create-route-local | `routes/(app)/channel/chat/-components/ChatSidebar/ChatListItem/` | /component |
| ChatRowContextMenu | Component | — | — | `useDialogStore: { writes }` | `[isOpen]` (popover) | create-route-local | inside ChatListItem | /component |
| ChatPanel | Section | `useGetChannel`, `useGetChannelSidebar` (subset for current chat), `useListChatMessages` | reads: `chatId` | `useChatStore: { reads: channelId, chatLimit }` | `[isAtBottom, unreadCount, isSearchOpen, searchQuery, activeMatchIndex, isDraggingFile]` | create-route-local | `routes/(app)/channel/chat/-components/ChatPanel/` | /component |
| ChatHeader | Component | props from ChatPanel | — | — | — | create-route-local | `routes/(app)/channel/chat/-components/ChatPanel/ChatHeader/` | /component |
| MessageList | Section | `useListChatMessages` (cascaded from ChatPanel parent OR re-queried) | — | — | `[scrollState]` | create-route-local | `routes/(app)/channel/chat/-components/ChatPanel/MessageList/` | /component |
| MessageBubble | Leaf | props from MessageList | — | — | `[isHovered]` | create-route-local | `routes/(app)/channel/chat/-components/ChatPanel/MessageBubble/` | /component |
| MessageActions | Component | props from MessageBubble | — | `useDialogStore: { writes }` | — | create-route-local | `routes/(app)/channel/chat/-components/ChatPanel/MessageActions/` | /component |
| MessageComposer | Component | — (owns `useSendChatMessage`) | — | `useChatStore: { reads: channelId }` | `[draft, attachments, isRecording]` | create-route-local | `routes/(app)/channel/chat/-components/ChatPanel/MessageComposer/` | /component |
| AttachmentMenu | Component | — | — | `useDialogStore: { writes }` | `[isOpen]` | create-route-local | inside MessageComposer | /component |
| SearchOverlay | Component | — (filters MessageList client-side OR query) | — | — | `[query, results, activeIndex]` | create-route-local | `routes/(app)/channel/chat/-components/ChatPanel/SearchOverlay/` | /component |
| PatientInfoPanel | Section | `useGetPatient({ patientId })` (when chat linked) | reads: `chatId` (to resolve patientId) | `useChatStore: { reads: channelId }` | — | create-route-local | `routes/(app)/channel/chat/-components/PatientInfoPanel/` | /component |
| AgentConfigPopover | Component | `useGetAgentConfig({ chatId })` | — | — | `[isOpen]` | create-route-local | inside PatientInfoPanel | /component |
| GroupInfoPanel | Section | `useGetGroupInfo({ chatId })` | reads: `chatId` | — | — | create-route-local | `routes/(app)/channel/chat/-components/GroupInfoPanel/` | /component |
| ConnectionPanel | Section | `useChannelSyncState(channelId)` | — | `useChatStore: { reads: channelId }` | — | create-route-local | `routes/(app)/channel/chat/-components/ConnectionPanel/` | /component |
| useChatStore | (store, not citizen) | — | — | global to this route | — | create-route-local | `routes/(app)/channel/chat/-stores/useChatStore.ts` | /store |
| InstanceManagementDialog | Dialog | `useGetInstanceProfile`, `useUpdateInstance` | — | `useDialogStore` | `[activeTab]` | create-route-local | `routes/(app)/channel/chat/-components/ChatSidebar/InstanceManagementDialog/` | /component |
| SendMediaDialog | Dialog (contains Form) | `useSendChatMessage` (with media payload) | — | `useDialogStore` | `[file, preview, caption]` | create-route-local | `routes/(app)/channel/chat/-components/ChatPanel/SendMediaDialog/` | /component + /form |
| ForwardMessageDialog | Dialog (contains Form) | `useGetChannelSidebar` (to pick target chat) + `useForwardMessage` | — | `useDialogStore` | `[selectedChatId, comment]` | create-route-local | `routes/(app)/channel/chat/-components/ChatPanel/ForwardMessageDialog/` | /component + /form |
| CreatePatientDialog | Dialog | — | — | `useDialogStore` | — | reuse — `@/components/Dialogs/CreatePatientDialog/` | `@/components/Dialogs/CreatePatientDialog/index.tsx` | (already exists) |
| ConfirmDialog | Dialog (generic) | — | — | `useDialogStore.confirm()` | — | reuse — `@codm/app-ui/confirm-dialog` | `@codm/app-ui/confirm-dialog` | (already exists) |

**Per-node notes:**

- **ChatPanel** — Maximally complex Section: 5 distinct sub-components, 3+ queries, 8 useState. Owns drag-and-drop for media. Renders inline empty state when `chatId` is undefined. ARIA: `role="region" aria-label="Conversa"`.
- **MessageList** — Renders `MessageBubble ×N` plus day-separator labels via `formatDayLabel`. Infinite scroll upward (older messages). Skeleton: 5 bubble placeholders at center.
- **MessageBubble** — Conditionally renders quoted reply, media attachments, status ticks. Hover reveals `MessageActions`.
- **useChatStore** — Holds `channelId` (set once from loader), `chatLimit` (paged sidebar), and any ephemeral UI flags shared across sidebar/panel. **Does NOT hold `chatId`** — that lives in URL.
- **PatientInfoPanel vs GroupInfoPanel vs ConnectionPanel** — Mutually exclusive right-column variants. The Route Shell decides which to mount based on chat type and connection state read from `chatId` resolution + `useChannelSyncState`.

### Reuse Summary

- **Reuse (no work):**
  - `CreatePatientDialog` — `@/components/Dialogs/CreatePatientDialog/`
  - `ConfirmDialog` — `@codm/app-ui/confirm-dialog` (via `useDialogStore.confirm()`)
- **Promote to shared:** (none — chat UI is sufficiently domain-coupled that promotion would leak abstractions)
- **Create new shared:** (none)
- **Create route-local:** all Sections, Components, Dialogs listed above (chat-domain coupled)

### Hand-off — Skills a invocar no `/build`

| Order | Skill | Artifact | Path | Notes |
|---|---|---|---|---|
| 1 | /route | ChatRoute | `routes/(app)/channel/chat/route.tsx` | extends parent loader's `channelId` |
| 2 | /store | useChatStore | `routes/(app)/channel/chat/-stores/useChatStore.ts` | holds channelId + chatLimit + ephemeral flags |
| 3 | /component | ChatSidebar | `routes/(app)/channel/chat/-components/ChatSidebar/` | owns sidebar query; mounts InstanceManagementDialog |
| 4 | /component | ConnectionBadge | inside ChatSidebar | reads useChannelSyncState |
| 5 | /component | ChatListItem | `routes/(app)/channel/chat/-components/ChatSidebar/ChatListItem/` | Leaf; writes `chatId` |
| 6 | /component | ChatRowContextMenu | inside ChatListItem | popover → opens dialogs |
| 7 | /component | InstanceManagementDialog | `routes/(app)/channel/chat/-components/ChatSidebar/InstanceManagementDialog/` | tabbed dialog |
| 8 | /component | ChatPanel | `routes/(app)/channel/chat/-components/ChatPanel/` | maximally complex Section |
| 9 | /component | ChatHeader | `.../ChatPanel/ChatHeader/` | |
| 10 | /component | MessageList | `.../ChatPanel/MessageList/` | owns messages query |
| 11 | /component | MessageBubble | `.../ChatPanel/MessageBubble/` | Leaf with media variants |
| 12 | /component | MessageActions | `.../ChatPanel/MessageActions/` | popover that opens dialogs |
| 13 | /component | MessageComposer | `.../ChatPanel/MessageComposer/` | owns send mutation, drag-drop |
| 14 | /component | AttachmentMenu | inside MessageComposer | |
| 15 | /component | SearchOverlay | `.../ChatPanel/SearchOverlay/` | client-side search |
| 16 | /component + /form | SendMediaDialog | `.../ChatPanel/SendMediaDialog/` | dialog containing media upload form |
| 17 | /component + /form | ForwardMessageDialog | `.../ChatPanel/ForwardMessageDialog/` | dialog with target chat picker |
| 18 | /component | PatientInfoPanel | `routes/(app)/channel/chat/-components/PatientInfoPanel/` | owns patient query |
| 19 | /component | AgentConfigPopover | inside PatientInfoPanel | |
| 20 | /component | GroupInfoPanel | `routes/(app)/channel/chat/-components/GroupInfoPanel/` | group chat variant |
| 21 | /component | ConnectionPanel | `routes/(app)/channel/chat/-components/ConnectionPanel/` | connection-severed variant |
| 22 | (reuse) | CreatePatientDialog | `@/components/Dialogs/CreatePatientDialog/` | opens from PatientInfoPanel |
| 23 | (reuse) | ConfirmDialog | `@codm/app-ui/confirm-dialog` | via `useDialogStore.confirm()` |

### Open Questions

- OQ-1. `MessageList` could be a Section (it orchestrates `MessageBubble` ×N + day-separator labels + media preview). It's labeled Section here because it owns the messages query. **Confirmed Section** by rule "sole data root of a region".
- OQ-2. `ConnectionBadge`, `ChatRowContextMenu`, `AttachmentMenu` — each is a small Component inside a Section. Borderline whether they deserve their own folder vs being inline files under the parent. **Proposed:** keep as folders for ARIA + Storybook, except `ChatRowContextMenu` which is a small `.tsx` colocated next to `ChatListItem/index.tsx` (matches current dev convention).
