# CodeDM Channel Port — Step 2: Wire Classification

> **Purpose.** The medscall channel Go service was copied **verbatim** into
> `packages/api/go` at commit `b4530e2b` (module-renamed only, no behavioral edits).
> This document walks that copied service's **complete event + enum surface** and
> classifies every item against the frozen CodeDM contract:
>
> - **[WIRE-EXISTING]** — the fact already lives in `packages/contracts` (the frozen
>   phase-3 set + the `25b8e46c` "port medscall channel wire surface" amendment +
>   the `fc6bdd27` gateway-projection tables). Mapped contract name given.
> - **[WIRE-NEW]** — crosses a process/language boundary but is **absent** from
>   contracts (would need a new amendment).
> - **[LOCAL]** — domain-internal to the Go service, stays Go-only.
>
> **Classification rule:** cross-process / cross-language fact = **wire**;
> intra-service fact = **local**.
>
> **Sources diffed**
> - Copied service: `packages/api/go/internal/channel/{events,enums}`,
>   `packages/api/go/internal/shared/{events,enums,db}` @ codedm `b4530e2b`.
> - Contracts: `packages/contracts/wire/{events,enums}` + `db/schema/{channel,infrastructure}.ts`
>   @ codedm HEAD (`25b8e46c` enums+events, `fc6bdd27` gateway tables).
> - Origin (read-only): `medscall/software/monorepo/packages/channel`.

---

## Headline finding

The `25b8e46c` amendment **pre-absorbed the entire medscall channel integration
surface** into contracts. Result:

- **19 / 19** integration events the copied service actually publishes are
  **WIRE-EXISTING**. **Zero WIRE-NEW events.**
- Every enum that rides a wire payload is **WIRE-EXISTING**.
- The remaining work is **not "add missing contracts"** — it is **reconciliation of
  value-set / column / shape divergences** inside already-existing wire items, plus a
  **schema-namespace retarget** (`channel` → `gateway`). All of that is Step 3
  (Retarget), flagged here.

---

## A. Integration events (egress boundary) — the cross-process facts

**Egress verified two ways.** (1) Handlers in `internal/channel/handlers/*` construct
`sharedevents.New…Event(...)` and hand them to the `ExternalMediator`; (2) the
`/events` SSE controller (`internal/shared/controllers/listen_events.go`) re-broadcasts
every integration event to the frontend. Grep of `sharedevents.New*Event(` + the one
irregular `ChannelNewSpecialPlatformEvent(` constructor confirms **all 19** shared
events are published (none dead).

| Copied service (`internal/shared/events`) | Wire name emitted | Contracts `.tsp` | Class |
|---|---|---|---|
| `channel_message_received.go` | `integration.channel_message.received` | `channel-message-received.tsp` | **WIRE-EXISTING** |
| `channel_message_delivered.go` | `integration.channel_message.delivered` | `channel-message-delivered.tsp` | **WIRE-EXISTING** |
| `channel_message_seen.go` | `integration.channel_message.seen` | `channel-message-seen.tsp` | **WIRE-EXISTING** |
| `channel_connected.go` | `integration.channel.connected` | `channel-connected.tsp` | **WIRE-EXISTING** |
| `channel_disconnected.go` | `integration.channel.disconnected` | `channel-disconnected.tsp` | **WIRE-EXISTING** |
| `channel_logged_out.go` | `integration.channel.logged_out` | `channel-logged-out.tsp` | **WIRE-EXISTING** |
| `channel_presence_updated.go` | `integration.channel.presence_updated` | `channel-presence-updated.tsp` | **WIRE-EXISTING** |
| `channel_chat_presence_updated.go` | `integration.channel.chat_presence_updated` | `channel-chat-presence-updated.tsp` | **WIRE-EXISTING** |
| `channel_remote_created.go` | `integration.channel.remote_created` | `channel-remote-created.tsp` | **WIRE-EXISTING** |
| `channel_remote_updated.go` | `integration.channel.remote_updated` | `channel-remote-updated.tsp` | **WIRE-EXISTING** |
| `channel_remote_deleted.go` | `integration.channel.remote_deleted` | `channel-remote-deleted.tsp` | **WIRE-EXISTING** |
| `channel_remotes_synced.go` | `integration.channel.remotes_synced` | `channel-remotes-synced.tsp` | **WIRE-EXISTING** |
| `channel_messages_synced.go` | `integration.channel.messages_synced` | `channel-messages-synced.tsp` | **WIRE-EXISTING** |
| `channel_membership_added.go` | `integration.channel.membership_added` | `channel-membership-added.tsp` | **WIRE-EXISTING** |
| `channel_membership_removed.go` | `integration.channel.membership_removed` | `channel-membership-removed.tsp` | **WIRE-EXISTING** |
| `channel_sync_started.go` | `integration.channel.sync_started` | `channel-sync-started.tsp` | **WIRE-EXISTING** |
| `channel_sync_progress.go` | `integration.channel.sync_progress` | `channel-sync-progress.tsp` | **WIRE-EXISTING** |
| `channel_sync_completed.go` | `integration.channel.sync_completed` | `channel-sync-completed.tsp` | **WIRE-EXISTING** |
| `channel_special_platform_event.go` | `integration.channel_special_platform_event.received` | `channel-special-platform-event-received.tsp` | **WIRE-EXISTING** |
| `channel_event.go` | *(no wire name — envelope union type)* | n/a — `ChannelEvent` is the in-process discriminated-union carrier read by projection replay | **LOCAL** |

### A.1 Payload-shape divergence inside WIRE-EXISTING (Retarget, not classification)

The **names** match; several **payload shapes** do not. The medscall payloads carry the
raw domain shape (nested `Content`/`PlatformData` `json.RawMessage` unions, `messageId` +
`internalMessageId`, `senderId`, `timestamp` int64, `Platform` enum). Contracts
**deliberately flattened** them to scalars + enums (the wire codegen carries no nested
models). Representative gaps to reconcile in Retarget:

- `channel_message.received`: medscall `{messageId, internalMessageId, remoteId, senderId,
  fromMe, messageType, content(RawMessage union), platform, platformData(RawMessage)}`
  → contracts `{channelId, messageId, contactExternalId, contactDisplayName, contactKind,
  senderExternalId, isGroup, text, quotedEntryId?, platform, receivedAt}`. Contracts
  collapses the `MessageType`-discriminated content union to a single `text` field and
  the `ContactRef` VO to flat `contact*` scalars.
- `platform` field: medscall stamps the `Platform` enum (`WHATSAPP | INTERNAL`);
  contracts types it as `ChannelKind` (`WHATSAPP | INSTAGRAM_DM | TELEGRAM`) — see §C.
- `remote_created` etc.: medscall `RemoteType` → contracts `contactKind: ContactKind`
  (`USER` → `CONTACT` rename, §C).

### A.2 Contracts channel events NOT emitted by the copied service (dormant on egress)

These `.tsp` events exist in contracts but the copied medscall service **does not publish
them** (no `internal/shared/events/*` file, no handler constructor). They are wire slots
defined-and-dormant, waiting on the gateway phase — nothing to classify from the Go side,
listed so the asymmetry is visible:

- `integration.channel_message.sent` (`channel-message-sent.tsp`) — medscall has the
  **domain** event `channel.message_sent` but never promotes it to an integration event.
- `integration.channel_message.edited` (`channel-message-edited.tsp`) — domain-only in medscall.
- `integration.channel_message.deleted` (`channel-message-deleted.tsp`) — domain-only in medscall.
- `integration.channel.pairing_qr_updated` (`channel-pairing-qr-updated.tsp`) — **codedm-only** (no medscall lineage; QR arrives via the generic special-platform-event in medscall).
- `integration.channel.outbound_delivered` (`channel-outbound-delivered.tsp`) — **codedm-only** frozen phase-3 event.
- `integration.channel.delivery_requested` (`channel-delivery-requested.tsp`) — **codedm-only** frozen phase-3 event.

---

## B. Domain events — LOCAL (Go-only, intra-service)

All 38 `internal/channel/events/*` are `channel.*`-prefixed **domain events** dispatched
through the `InternalMediator` / outbox **inside** the service. They never cross a
boundary as themselves → **all LOCAL**. Some are *promoted* by a handler into the
matching §A integration event (that integration event is the wire fact, not the domain
event). A whitelisted subset is also mirrored to the frontend over the `/events` **SSE**
stream — that is the Go service's **own** OpenAPI/SSE surface (typed by
`EventPayloads` → the service's own SDK), **not** a contracts wire fact, so it stays
LOCAL.

| Domain event (`channel.*`) | Class | Promotes to §A integration event? | On SSE whitelist? |
|---|---|---|---|
| `channel.message_received` | LOCAL | yes → `channel_message.received` | yes |
| `channel.message_delivered` | LOCAL | yes → `channel_message.delivered` | yes |
| `channel.message_seen` | LOCAL | yes → `channel_message.seen` | yes |
| `channel.message_sent` | LOCAL | **no** (domain-only; contracts slot dormant) | no (projection-only) |
| `channel.message_edited` | LOCAL | **no** (domain-only) | no |
| `channel.message_deleted` | LOCAL | **no** (domain-only) | no |
| `channel.channel_created` | LOCAL | no | no |
| `channel.channel_connecting` | LOCAL | no | no |
| `channel.channel_connected` | LOCAL | yes → `channel.connected` | no |
| `channel.channel_disconnected` | LOCAL | yes → `channel.disconnected` | no |
| `channel.channel_deleted` | LOCAL | no | no |
| `channel.gateway_connected` | LOCAL | no (feeds `channel.connected` via handler) | yes |
| `channel.gateway_disconnected` | LOCAL | no | yes |
| `channel.gateway_logged_out` | LOCAL | yes → `channel.logged_out` | yes |
| `channel.gateway_platform_event` | LOCAL | yes → `channel_special_platform_event.received` | yes |
| `channel.gateway.history_sync` | LOCAL | no | no |
| `channel.gateway.picture_changed` | LOCAL | no | no |
| `channel.gateway.sync_complete` | LOCAL | no | no |
| `channel.presence_updated` | LOCAL | yes → `channel.presence_updated` | yes |
| `channel.chat_presence_updated` | LOCAL | yes → `channel.chat_presence_updated` | yes |
| `channel.remote_created` | LOCAL | yes → `channel.remote_created` | no |
| `channel.remote_updated` | LOCAL | yes → `channel.remote_updated` | no |
| `channel.remote_deleted` | LOCAL | yes → `channel.remote_deleted` | no |
| `channel.remotes_synced` | LOCAL | yes → `channel.remotes_synced` | no |
| `channel.messages_synced` | LOCAL | yes → `channel.messages_synced` | no |
| `channel.membership_added` | LOCAL | yes → `channel.membership_added` | no |
| `channel.membership_removed` | LOCAL | yes → `channel.membership_removed` | no |
| `channel.sync_started` | LOCAL | yes → `channel.sync_started` | yes |
| `channel.sync_progress` | LOCAL | yes → `channel.sync_progress` | yes |
| `channel.sync_completed` | LOCAL | yes → `channel.sync_completed` | yes |
| `channel.remote_pinned` | LOCAL | no (control-plane, projection-only) | no |
| `channel.remote_unpinned` | LOCAL | no | no |
| `channel.remote_archived` | LOCAL | no | no |
| `channel.remote_unarchived` | LOCAL | no | no |
| `channel.remote_muted` | LOCAL | no | no |
| `channel.remote_unmuted` | LOCAL | no | no |
| `channel.remote_marked_as_unread` | LOCAL | no | no |
| `channel.remote_chat_seen` | LOCAL | no | no |

> The 8 `remote_*` control-plane events (pin/mute/archive/mark-unread/chat-seen) are
> **purely local** — no integration event, no SSE. They mutate the `remotes` projection
> and never leave the service. Faithfully Go-only.

---

## C. Enums

### C.1 `internal/channel/enums` (channel domain)

| Copied enum | Values | Contracts `.tsp` | Class | Divergence → Retarget |
|---|---|---|---|---|
| `message_type.go` | TEXT, IMAGE, VIDEO, AUDIO, DOCUMENT, STICKER, LOCATION, CONTACT, POLL, LIST, BUTTON, REACTION, STATUS | `message-type.tsp` `MessageType` | **WIRE-EXISTING** | none — exact match |
| `direction.go` | SENT, RECEIVED | `direction.tsp` `Direction` | **WIRE-EXISTING** | none — exact match |
| `chat_presence_type.go` | composing, recording, paused | `chat-presence-type.tsp` `ChatPresenceType` | **WIRE-EXISTING** | none — exact match |
| `presence_type.go` | AVAILABLE, UNAVAILABLE, COMPOSING, RECORDING, PAUSED | `presence-type.tsp` `PresenceType` | **WIRE-EXISTING** | none (contracts marks dormant) |
| `group_role.go` | member, admin, super_admin | `group-role.tsp` `GroupRole` | **WIRE-EXISTING** | none — exact match (dormant) |
| `membership_action.go` | joined, left, promoted, demoted | `membership-action.tsp` `MembershipAction` | **WIRE-EXISTING** | none — exact match (dormant) |
| `history_sync_type.go` | initial, recent | `history-sync-type.tsp` `HistorySyncType` | **WIRE-EXISTING** | none — exact match |
| `channel_status.go` | CREATED, CONNECTING, CONNECTED, DISCONNECTED, DELETED | `channel-status.tsp` `ChannelStatus` = DISCONNECTED, PAIRING, CONNECTED | **WIRE-EXISTING** | ⚠ **value-set diverges** — medscall has `CREATED / CONNECTING / DELETED`; contracts has `PAIRING`. Only `CONNECTED`/`DISCONNECTED` overlap. |
| `remote_type.go` | USER, GROUP, BROADCAST | `contact-kind.tsp` `ContactKind` = CONTACT, GROUP, BROADCAST | **WIRE-EXISTING** | ⚠ **name + value rename** — enum `RemoteType`→`ContactKind`; value `USER`→`CONTACT` (contracts doc already records the harmonization). |
| `proxy_protocol.go` | HTTP, HTTPS | *(none)* | **LOCAL** | gateway proxy-dial config; never on a wire payload. |

### C.2 `internal/shared/enums` (generic shared package, copied wholesale)

These are a generic utility package that rode along with the verbatim copy. Only
`platform` participates in the channel wire surface; the rest are **service-internal /
config** and not on any channel cross-process path.

| Copied enum | Values | Contracts `.tsp` | Class | Note |
|---|---|---|---|---|
| `platform.go` | WHATSAPP, INTERNAL | `channel-kind.tsp` `ChannelKind` = WHATSAPP, INSTAGRAM_DM, TELEGRAM | **WIRE-EXISTING** | ⚠ enum `Platform`→`ChannelKind`; medscall's `INTERNAL` value is **absent** from `ChannelKind` (contracts adds INSTAGRAM_DM/TELEGRAM instead). Reconcile the `INTERNAL` platform in Retarget. |
| `currency.go` | BRL, USD, EUR | `currency-code.tsp` `CurrencyCode` (ISO-4217 superset, ~80 values incl. BRL/USD/EUR) | **WIRE-EXISTING** (superset) | Not on the channel egress path — shared util. Contracts value-set is a strict superset; no conflict. |
| `language.go` | PT, EN, ES | `language.tsp` `Language` = BR, US | **WIRE-EXISTING** | ⚠ **value-set diverges** (language codes `PT/EN/ES` vs locale-ish `BR/US`). Not on the channel egress path; reconcile only if ever wired. |
| `country.go` | BR, US | *(none)* | **LOCAL** | Not in contracts, not on any channel wire payload. Latent WIRE-NEW only if a future cross-context payload needs it. |
| `environment.go` | DEVELOPMENT, STAGING, PRODUCTION | *(none)* | **LOCAL** | Runtime/deploy config. Go-only. |
| `log_level.go` | DEBUG, INFO, WARN, ERROR | *(none)* | **LOCAL** | Logging config. Go-only. |

### C.3 Gateway-adapter sub-package (out of the four scoped dirs, noted for completeness)

`internal/channel/services/gateway/whatsapp/{enums,events}` — `receipt_type.go`,
`qr_code_updated.go`. These are WhatsApp-adapter internals (whatsmeow translation
layer) → **LOCAL**. Note: contracts' `special-platform-event-type.tsp`
`SpecialPlatformEventType` (`qr_code_updated`) is a **codedm typed harmonization** of
what medscall carries as a nested `WhatsAppQRCodeUpdated` `json.RawMessage` variant —
WIRE-EXISTING on the contracts side, sourced from this adapter, not from a top-level
medscall enum.

---

## D. Migrations — copied service expects vs contracts declares

The copied service ships the **full medscall golang-migrate set**
(`internal/shared/db/sql/migrations/001…018`, verbatim). Applied in order, the
**final surviving table set** is (config tables from `001`/`004` are dropped in
`008`/`009`'s event-sourcing cleanup and never recreated):

| Final table (copied service) | Schema written to | Contracts declaration | Match? |
|---|---|---|---|
| `channels` | `channel` (search_path = `cfg.ServiceName`, default `"channel"`) | `gateway.channels` (`db/schema/channel.ts`) | ⚠ **namespace + columns** |
| `remotes` | `channel` | `gateway.remotes` | ✅ faithful (contracts ports 011/014/015) |
| `remote_memberships` | `channel` | `gateway.remote_memberships` | ✅ faithful (ports 011) |
| `messages` | `channel` | `gateway.messages` | ✅ faithful (ports 012/014/015) |
| `shared.events` | `shared` | `shared.events` (`db/schema/infrastructure.ts`) | ⚠ **columns** |
| `shared.outbox` | `shared` | `shared.outbox` (`db/schema/infrastructure.ts`) | ⚠ **columns** |

### D.0 Schema-namespace mismatch (top-level)

The copied Go service sets `search_path = ServiceName` and `ServiceName` defaults to
**`"channel"`** (`internal/shared/config/config.go`). So its projectors write
`channel.channels`, `channel.remotes`, … Contracts declares them under
`pgSchema('gateway')`. **Retarget must repoint the service to the `gateway` schema**
(or override `ServiceName=gateway`), otherwise the Go writes and the Drizzle-declared
tables live in different schemas.

### D.1 `channels` — column-level mismatches (the one projection that diverges)

Copied service final `channels` (010 + 013 + 015 + 016):

```
id UUID PK · owner_id TEXT · platform TEXT · name TEXT DEFAULT '' ·
owner_remote_id TEXT DEFAULT '' (renamed from platform_jid in 015) ·
credentials JSONB · status TEXT · connected_at TIMESTAMPTZ · disconnected_at TIMESTAMPTZ ·
created_at · updated_at · version BIGINT
  (connection_state dropped in 016)
```

Contracts `gateway.channels`:

```
id uuid PK · owner_id uuid · kind text · status text DEFAULT 'DISCONNECTED' ·
account_detail text DEFAULT '' · created_at · updated_at
```

| medscall column | contracts column | mismatch |
|---|---|---|
| `owner_id TEXT` | `owner_id uuid` | **type** TEXT → uuid |
| `platform TEXT` | `kind text` | **rename** platform → kind |
| `owner_remote_id TEXT` | `account_detail text` | **rename** owner_remote_id → account_detail |
| `name TEXT` | — | **contracts drops it** (medscall legacy T6 column) |
| `credentials JSONB` | — | **contracts drops it** (whatsmeow store owns creds) |
| `connected_at`, `disconnected_at` | — | **contracts drops both** |
| `version BIGINT` | — | **contracts drops it** (channels has no optimistic-lock col) |
| indexes `idx_channels_owner_id`, `idx_channels_owner_platform` | `channels_owner_kind_idx (owner, kind)` | index rename/consolidation |

> Retarget must either (a) trim the Go `PgChannelRepository` writes/reads to the
> contracts column set (`kind`, `account_detail`, drop name/credentials/connected_at/
> disconnected_at/version, cast owner_id→uuid), or (b) widen contracts `gateway.channels`
> back toward medscall. The `remotes`/`remote_memberships`/`messages` projections need
> **no** column work — they were ported faithfully.

### D.2 `shared.events` — column mismatches (co-owned table)

| medscall (`001`) | contracts (`infrastructure.ts`) | mismatch |
|---|---|---|
| `id TEXT PK` | `id uuid PK defaultRandom` | **type** TEXT → uuid |
| `entity_id TEXT NOT NULL` | `entity_id text` (nullable) | nullability |
| `owner_id TEXT NOT NULL` | `owner_id text` (nullable) | nullability |
| `time TIMESTAMPTZ` | `occurred_at timestamptz DEFAULT now()` | **rename** time → occurred_at |
| `updated_at`, `version` | — | contracts drops both |
| — | `source text NOT NULL` | contracts **adds** source |

### D.3 `shared.outbox` — column mismatches (co-owned table, medscall `018` unified)

| medscall (`018`) | contracts (`infrastructure.ts`) | mismatch |
|---|---|---|
| `id TEXT PK` | `id uuid PK defaultRandom` | **type** TEXT → uuid |
| `time TIMESTAMPTZ` | — | contracts drops `time` |
| `updated_at`, `version` | — | contracts drops both |
| — | `entity_id text` | contracts **adds** entity_id |
| — | `last_error text` | contracts **adds** last_error |
| `name, source, owner_id, payload, processed_at, attempts, created_at` | same | ✅ overlap |
| index `outbox_unprocessed_idx (source, processed_at, created_at)` | same name/cols | ✅ |

> `shared.events` + `shared.outbox` are **co-owned** by the Go service and the TS/Drizzle
> migrations (medscall `018` note: Go polls `shared.outbox WHERE source='channel'`; api
> uses `source='api'`). The copied service's sqlc queries expect the medscall columns
> (`id TEXT`, `time`, `version`); contracts declares uuid `id`, `occurred_at`,
> `last_error`, `source`. Both cannot own the same physical table with different DDL —
> **Retarget must pick one shape** (contracts-wins per "one migration source" rule) and
> adapt the Go sqlc layer to it.

---

## E. Reconcile backlog handed to Step 3 (Retarget)

1. **Schema namespace:** repoint Go projectors `channel` → `gateway` schema (§D.0).
2. **`channels` columns:** rename platform→kind, owner_remote_id→account_detail; drop
   name/credentials/connected_at/disconnected_at/version; owner_id TEXT→uuid (§D.1).
3. **`shared.events` / `shared.outbox`:** converge Go sqlc onto the contracts column
   shape (uuid id, occurred_at/source/last_error; drop time/version) (§D.2–D.3).
4. **`ChannelStatus` value-set:** CREATED/CONNECTING/DELETED (Go) vs PAIRING (contracts)
   (§C.1).
5. **`Platform`→`ChannelKind`:** reconcile medscall `INTERNAL` (absent from ChannelKind)
   (§C.2).
6. **`RemoteType`→`ContactKind`:** apply `USER`→`CONTACT` through the Go layer (§C.1).
7. **Payload shapes:** collapse medscall nested `Content`/`PlatformData` unions to the
   contracts flattened scalar+enum event shapes (§A.1).
8. **No new contracts amendments required for events** — the medscall integration surface
   is fully present; do not re-open the frozen set to add events (the 3 domain-only
   message events + 3 codedm-only events in §A.2 already have their slots).

## F. Tallies

- Integration events published (egress): **19** → **19 WIRE-EXISTING**, 0 WIRE-NEW, 0 LOCAL.
- `ChannelEvent` union carrier: 1 LOCAL.
- Domain events: **38** → **38 LOCAL** (21 promote to a §A wire event; 12 SSE-mirrored; 8 pure-local).
- Channel enums: **10** → 9 WIRE-EXISTING (3 with divergence), 1 LOCAL.
- Shared enums: **6** → 3 WIRE-EXISTING (2 divergent, off channel path), 3 LOCAL.
- Migration tables (final): **6** → 3 faithful (remotes, remote_memberships, messages),
  3 mismatched (channels, shared.events, shared.outbox) + 1 schema-namespace retarget.
- **WIRE-NEW total: 0.**

---

## G. Step 3 (Retarget) — what was executed vs deferred

Step 2 = contracts amendment; Step 3 = deterministic retarget of the copied Go
("change names/imports, never logic; LOCAL items untouched"). This section records
what that mandate could faithfully execute and what it forces to defer.

### G.0 Contracts (Step-1 amendment) — no-op, by design

**Zero WIRE-NEW** (headline / §F). The entire medscall channel integration surface —
all 19 egress events + every wire enum — was pre-absorbed at `25b8e46c`, so **no
TypeSpec amendment was authored** and the frozen enums were **not** re-opened. The
divergent medscall enum values (`ChannelKind.INTERNAL`, `ChannelStatus`
CREATED/CONNECTING/DELETED) were deliberately **not** back-ported into the frozen
harmonized enums — doing so would propagate source-system legacy states into the
contract (violates generalize-over-port + "do not re-open the frozen set"). Verified
green: `bun run contracts` (tsp + wire codegen + drizzle) reports no generated drift;
`check:generated` clean.

### G.1 Executed (code, committed)

1. **7 exact-match wire enums aliased onto `template/contracts-go/wire`** (§C.1) via Go
   `type X = wire.Y` + const re-export: `MessageType`, `Direction`, `ChatPresenceType`,
   `PresenceType`, `GroupRole`, `MembershipAction`, `HistorySyncType`. Name/import-only
   swap — identifiers preserved, runtime values byte-identical, zero call-site churn.
   `api-go/go.mod` gains `require template/contracts-go` + local `replace`.
2. **Schema namespace `channel` → `gateway`** (§D.0 / §E.1, backlog item 1): the Go
   `ServiceName` code-default (drives `search_path`) is now `gateway`, matching the
   contracts `pgSchema('gateway')`. `.env.example` already ships `SERVICE_NAME=gateway`,
   so runtime was already correct; this aligns the code fallback + its config test. The
   projection queries are schema-unqualified (resolved via `search_path`), so the rename
   is confined to config — no query edits, no test-schema churn.

### G.2 Migration source — the canonical decision

**codedm migrations come from `packages/contracts` drizzle ONLY.** The copied Go
service's embedded golang-migrate set (`internal/shared/db/sql/migrations/001…018`) is
**retained in-tree strictly as historical reference** and to bootstrap the **isolated**
repo integration tests (each spins up its own random per-test schema in a **dedicated
throwaway DB** via `CHANNEL_TEST_DATABASE_URL`; they skip when it is unset). Those
embedded migrations are **not** the codedm runtime-schema source and must not be treated
as a second migration authority.

### G.3 Deferred — reconcile-backlog NOT executed in this deterministic step

The remaining §E items change **runtime values or table shapes** (logic), cascade into
projection structs / projectors / the shared event+outbox infra and ~40 test assertions,
and would **desync the in-tree reference migrations that back the isolated tests**. They
are therefore **not** doable as "name/import-only" edits and are handed to the
**schema-ownership-handoff phase** (when the Go stops applying its own migrations and
reads/writes the drizzle-owned `gateway.*` / `shared.*` tables directly):

- **`channels` column shape (§D.1):** `platform→kind`, `owner_remote_id→account_detail`,
  drop `name`/`credentials`/`connected_at`/`disconnected_at`/`version`, `owner_id`
  TEXT→uuid. (Renaming the query columns without editing the reference migration that
  still `CREATE`s `platform`/`version` would break the `channels` projection repo test;
  dropping columns cascades into `projections.Channel` + its projector = logic.)
- **`shared.events` / `shared.outbox` (§D.2–D.3):** converge onto uuid `id`,
  `occurred_at`/`source`/`last_error`, drop `time`/`version`. These are **co-owned** with
  the TS/Drizzle side. **Observed hazard:** the codedm DB's `shared.*` tables already
  exist in the contracts shape (no `time`); a first `go test` against that DB fails
  (`column "time" does not exist`) because the Go layer/reference-migration still expect
  `time` — exactly the "both cannot own one physical table with different DDL" problem.
  The dedicated-throwaway-DB test convention (§G.2) sidesteps it; the real convergence of
  the Go sqlc layer onto the contracts columns belongs to the handoff phase.
- **3 divergent enums (§C, backlog items 4–6):** `ChannelStatus` (value-set; off-wire —
  projection column only, so no wire-retarget benefit), `Platform→ChannelKind`
  (`INTERNAL` absent from `ChannelKind` + live in `message_projector`; `Platform` also
  carries an `IsValid()` method, which blocks a cross-package type alias),
  `RemoteType→ContactKind` (`USER`→`CONTACT` is a runtime **value** change asserted by
  ~40 tests + a raw-string gateway path — a value harmonization, not a name swap).
- **Event payload shapes (§A.1 / backlog item 7):** collapse the medscall nested
  `Content`/`PlatformData` unions to the contracts flattened scalar+enum event structs.
  The generated wire event structs are structurally different from medscall's
  `IntegrationEvent[Payload]` envelopes, so swapping them is a handler rewrite, not a
  sed-grade edit — deferred with the shapes.
