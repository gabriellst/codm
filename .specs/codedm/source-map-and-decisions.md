# CodeDM — source map + founder decisions (2026-07-21)

Produced by the 5-reader + reconciler workflow over whatscode, the clinical fork channel, and template v1.9.
Founder decisions (2026-07-21, chat): 1 Expo native app · 2 keep astro+expo, strip better-auth/billing/quota/notifications, ownerId→constant operator · 3 Go=external gateways ONLY, TS=domain incl. terminal/PTY, 2 processes, embedded DB (implemented as PGlite) · 4 WhatsApp-first (enum frozen for 3) · 5 LLM structured-generate classification · 6 PTY behind whatscode LlmRunner seam · 7 native work via Expo modules (SecureStore etc.); PTY stays in the TS daemon · 8 new sibling repo (this one), SDK @codedm/* · 9 needs-you via SSE + badge, no notifications context · 10 Router/ProviderCatalog/StopPolicyConfig demoted to services/config · 11 contract lock first.
Open reading to confirm: react kept as the web console alongside the expo native app (screenshots are desktop-web).

## Source map

### BC1 Channel Gateway (whole context)  `[clinical-fork-channel]`
- what: The Go WhatsApp gateway: gateway.Channel port, ChannelFactory/Registry, whatsmeow adapter, whatsmeow event→domain mapper (ACL), boot reconnection, projections + Redis/SSE egress. The gateway is already domain-clean (zero clinic coupling).
- how: extract-and-rename (module monorepo/api→codedm; CHANNEL_EVENT_GROUP_ID; fix 'Kafka' comments that are actually Redis Streams)

### WhatsApp adapter (WhatsmeowChannel, 1187 lines)  `[clinical-fork-channel]`
- what: Concrete send/receive/edit/delete, QR drain goroutine, history-sync bulk ACL, contact-snapshot, avatar hydration, AppState patches, LID normalization, whatsmeow sqlstore device-per-channel.
- how: extract-as-is (it is the single realized adapter and the reference for a 2nd platform)

### QR / pairing flow (C01/C02 StartPairing/CompletePairing)  `[clinical-fork-channel]`
- what: ConnectChannel→GetQRChannel (3-min ctx), QR returned sync AND emitted as WhatsAppQRCodeUpdated→SSE, purgeStaleDevices before fresh pair. Doc's 'rotating 30s pairing token' is the abstract form of this.
- how: extract-as-is (WhatsApp); the token-rotation contract is the platform-neutral wrapper

### Channel integration-event catalog (BC1 published events)  `[clinical-fork-channel]`
- what: integration.channel.{connected,disconnected,...} + integration.channel_message.{received,delivered,seen} Redis egress contract wrapping types.IntegrationEvent[T]{id,ownerId,time,name,payload}. Fully generic, no domain leakage.
- how: extract-and-rename (adopt the subset CodeDM needs; rename package)

### Exactly-once / dedup + outbox (Go dual-write + OutboxDispatcher)  `[clinical-fork-channel]`
- what: Deterministic UUIDv5=sha256(body) event ids; INSERT…ON CONFLICT(id) DO NOTHING into shared.events+shared.outbox; FOR UPDATE SKIP LOCKED per-owner ordered dispatch, 5 retries→dead-letter. This IS the NFR 'redeliver missed inbound exactly once' (at-least-once + idempotent sinks).
- how: extract-as-is (give CodeDM its own outbox source tag)

### Channel projections (channels/remotes/messages + projectors)  `[clinical-fork-channel]`
- what: Gateway-owned read-model tables + atomic-upsert projectors (insertIfNew/UpsertAllIfNew, dedup on (channel_id, platform_message_id)). Backs T05/T09 message lists.
- how: extract-as-is

### Redis Streams cross-service transport  `[clinical-fork-channel]`
- what: XADD events:<name> MAXLEN~10000 (Go publish) / XREADGROUP consumer-group + PEL redelivery + :dead stream (TS consume).
- how: extract-as-is — OR drop for a single-process local daemon (see openDecision on process topology)

### Multi-platform seam (Instagram DM / Telegram)  `[clinical-fork-channel]`
- what: Platform enum + @union/@variant discriminator + services/gateway/<platform>/ adapter convention, documented 'Adding a New Platform'. Only WHATSAPP realized; ~8 gateway.Channel methods are WhatsApp-shaped and would no-op/reinterpret.
- how: pattern-only (add @variant + new adapter structs; IG/Telegram adapters are new code)

### Service-to-service API-key guard  `[clinical-fork-channel]`
- what: apikey header vs CHANNEL_GLOBAL_API_KEY, bypassed when unset — how the TS daemon calls the gateway HTTP surface.
- how: extract-as-is

### Go OpenAPI emitter + Kubb SDK pipeline  `[clinical-fork-channel]`
- what: Metadata()+@union AST scan → OpenAPI 3.1 oneOf+discriminator → Kubb → typed SDK. Contract is codegen-bound, not hand-synced.
- how: extract-and-rename (@codedm/* SDK package)

### Terminal engine runtime abstraction (BC5 agent runtime)  `[whatscode]`
- what: LlmRunner interface: generate() single structured call, stream() full turn yielding transport frames + fanning domain events, closing with terminal AgentProcessFinishedEvent. Clean provider-agnostic port; MastraLlmRunner impl is LLM-specific and discarded.
- how: pattern-only (a PTY/subprocess runner implements the same interface; drives claude-code/codex/opencode CLI, not an LLM tool-loop)

### AgentStreamRegistry (live streaming registry)  `[whatscode]`
- what: Domain-free in-memory SSE writer registry: one-writer-per-key invariant (CHAT_ALREADY_STREAMING), per-owner soft cap (TOO_MANY_STREAMS), silent-drop deliver, force-unregister on writer throw. Tested. Process-local (documented TODO to shard by key).
- how: extract-as-is (rekey chatId→issueId/terminalSessionId)

### SSE Completion controller (agent stream endpoint)  `[whatscode]`
- what: POST /completion: AG-UI RunAgentInput wire shape, consumes latest message, keeps history server-side by actorId, forwards frames via createSSEResponse/encodeSSEFrame.
- how: pattern-only / extract-and-adapt (becomes the terminal-session stream endpoint)

### Two-stream split (transport frames vs domain facts)  `[whatscode]`
- what: AG-UI frames (token/tool-call/run lifecycle) forwarded untouched to browser, ChatEvents (domain facts) flow through the outbox; AgUiToChatEventAccumulator bridges. The key reusable idea.
- how: pattern-only (TerminalOutputAppended = transport stream; IssueOpened/AgentReplyDrafted/StopRaised = domain facts on the outbox)

### Chat / ChatSession session↔conversation model  `[whatscode]`
- what: Chat keyed by {ownerId,platform,channelId,subjectId} owning ChatSession children rebuilt from a persisted event log; single-active-session rule. ChatSessionStatus is only {ACTIVE,CLOSED}.
- how: pattern-only (maps to Thread↔Issue; rewrite with richer IssueStatus lifecycle NEEDS_INPUT/WORKING/COMPLETED + terminal states)

### Tool base class + delivery abstraction  `[whatscode]`
- what: Framework-agnostic Tool(name/description/inputSchema/outputSchema/execute); ChatProvider factory-by-platform with DeliveryMode {STREAM,OOB}. Concrete clinic tools are 100% discarded.
- how: pattern-only (coding tools are all new; ChatProvider maps to senderIdentity AGENT/ROUTER/OPERATOR delivery)

### Frontend chat surface  `[whatscode]`
- what: assistant-ui/react-ag-ui thread rendering over the /completion SSE stream. No terminal/xterm UI exists.
- how: pattern-only (reuse for T09 chat bubbles; the dark terminal panel T12 is new)

### BC4 Thread & Routing — classification/routing/control plane  `[new]`
- what: message→issue demultiplexing, reply-quote authoritative routing, mention gate, participants/invokers, rolling context buffer, whisper/steer, direct-mode composer, transcript. No source has message→issue triage.
- how: rewrite-against-contract (template DDD scaffold; Chat/ChatSession pattern for session shape only)

### Router / ClassifyMessage engine (C17/C18)  `[new]`
- what: Resolution order reply-quote > context-match ≥ threshold > new-issue > clarification, <2s median; ClarificationRequested (max 1 open per sender). whatscode ChatEvent log is an audit trail, not classification.
- how: new (model as a classification Service + events + transcript projection, NOT an aggregate — see abstractionSwaps)

### BC5 Issue Execution — terminal session per issue  `[new]`
- what: PTY spawn/stream/teardown per issue on the thread's workspace with selected provider CLI; TerminalOutputAppended, stops, archive/auto-archive. No PTY/subprocess exists in any source.
- how: rewrite-against-contract (Go worker context mirroring internal/activity shape + template Issue aggregate)

### BC3 Provider Registry — CLI detection  `[new]`
- what: PATH + install-dir probing for Claude Code/Codex/OpenCode binaries, path/version/status, default provider. whatscode ModelRegistry resolves 'openai:model' strings — LLM-provider, NOT CLI detection.
- how: new (Go detection Service + thin config; NOT an aggregate)

### BC2 Workspace Registry — folder catalog  `[new]`
- what: Native folder-picker registration, git/Claude-project badge detection, absolute-path dedupe, block-remove-while-WORKING.
- how: new (template BC scaffold; FS/git detection is Go OS work)

### BC6 Artifact Registry  `[new]`
- what: Catalog of non-code agent outputs (IMAGE/FILE/LINK, preview deploys) per thread/issue.
- how: new (template bounded-context + projection scaffold)

### Screens T01–T15 (reads)  `[template]`
- what: BFF read pattern: Query use cases in the ui context reading projections via Drizzle; cross-thread IssuesOverview (T04) spans contexts → ui/projections.
- how: pattern-only (query skill + ui context; doc's 'Read Models' become BFF Queries)

### SSE browser seam (ListenEvents controller)  `[template]`
- what: Owner-scoped SSE broadcaster over ExternalMediator with empty BROWSER_EVENTS union ready to fill. Real-time backbone for live transcript/terminal/StopRaised/status.
- how: extract-and-adapt (neutralize the ownerId per-frame filter to a constant single operator)

### useServerEvents hook (frontend real-time)  `[template]`
- what: fetchEventSource → document CustomEvent → invalidate SDK query keys. Exactly the live-screen pattern for T03/T09/T12/T14.
- how: extract-as-is

### Write-side event backbone (Outbox + UnitOfWork + mediators, TS & Go)  `[template]`
- what: UnitOfWork saving entity+event atomically, OutboxDispatcher, Internal/External mediators; serves BC1→BC4, BC4→BC5, BC5→BC6 choreography.
- how: extract-as-is

### Contracts wire (TypeSpec enums + integration events)  `[template]`
- what: Phase-0 Contract-Lock surface: cross-boundary enums (pgEnum-paired) + per-event tsp. Only billing.subscription_changed ships today; the pattern is what CodeDM populates before parallel BC build.
- how: extract-and-populate

### Go worker reference context (internal/activity)  `[template]`
- what: Canonical worker shape: external handler consuming an integration event + projection + projector + query use case + read controller. Template for CodeDM's channel/terminal/provider Go contexts.
- how: pattern-only (mirror the shape; activity itself is dropped)

### Scheduled Job pattern (C28 AutoArchiveCompletedIssues)  `[template]`
- what: BillingClockJob/WindowReconcileJob periodic outbox-driven sweeps → template for the 24h auto-archive sweep. Doc's 'in-process desktop Scheduler' becomes this Job.
- how: pattern-only (copy the shape, then billing is dropped)

### ownerId axis / RequireOwner / Owner aggregate / better-auth  `[template]`
- what: 263 files reference ownerId; every controller runs AuthAccountMiddleware+RequireOwner; SSE + Go Session middleware key off it. CodeDM has one operator, no accounts.
- how: extract-and-adapt (seed ONE implicit Owner at first-run, make RequireOwner a no-op stamping a constant ~3 files; drop better-auth/login screens — collapse the axis, don't delete it)

### Value Objects (ContactRef, Participant, MentionGate, IssueLabel, Stop, TerminalLine)  `[template]`
- what: Doc's inline TS types/unions become template Value Objects (z.instance(Id) only on entity/VO schemas); shared VOs in shared/objects.
- how: pattern-only (value-object skill; MentionGate is a discriminated-union VO)

### Enums (IssueStatus, StopKind, StopResolution, ClassificationMethod, ThreadStatus, ArtifactKind, TranscriptKind, ArchiveReason, AttachFlowStyle, BufferSize)  `[template]`
- what: Doc's inline string unions become closed Enums single-sourced from contracts wire and pgEnum-paired.
- how: pattern-only (enum skill; live in contracts, not @shared)

### DDD citizen skills + bun cli scaffolder  `[template]`
- what: entity/value-object/enum/service/usecase/controller/query/projection/projector generators + review registries encode the architecture.
- how: extract-as-is (tooling generates the CodeDM citizens)

### Desktop shell + native bridge  `[new]`
- what: Tauri/Electron shell hosting the appReact webview + native bridge: OS keychain, native folder-picker (C05), dock badge, launch-at-login, PATH probe host, PTY host. Zero in-repo prefiguration.
- how: new (add a new workspace entry in template.config.ts WORKSPACES; largest build-out)

### Money / MultiCurrency VOs + billing/quota apparatus  `[template]`
- what: Doc explicitly states 'no monetary values'. MultiCurrencyMoney/MonetaryAmount + billing-provider + QuotaKey/Plan are pure drop.
- how: drop (removing billing/quota also removes ~203 of the ownerId references for free)

## Abstraction swaps

- **Local-first macOS/Windows desktop app; 'no server, everything stays on the machine'** → Template's api-ts + api-go as a LOCAL daemon + appReact (TanStack Start) as the webview renderer, wrapped by a Tauri shell
  - The template is a web renderer over an HTTP+event daemon that already does process/FS/git work in Go. Don't invent a bespoke desktop architecture — run the existing backend locally and add only the native shell. ~70% of CodeDM's backend needs are already-built template abstractions.
- **Secrets (provider keys, channel sessions) in the OS keychain** → whatsmeow sqlstore (channel session already persisted in Postgres) + template single-root .env for daemon config; OS keychain only for shell-level secrets
  - Channel-session persistence is already solved by the clinical fork gateway's whatsmeow sqlstore. Only the small set of user-provided secrets belongs in the keychain (a shell responsibility), not a wholesale rejection of the template's config model.
- **No authentication, no ownerId, no tenancy anywhere (single operator)** → Template ownerId multi-tenant axis collapsed to a single constant operator (no-op RequireOwner, one seeded Owner)
  - Deleting ownerId touches ~263 files; collapsing it to a constant touches ~3. Single-operator = single tenant. Neutralize the axis, don't fight it — and drop better-auth/billing/quota which contribute the bulk of the surface.
- **'Router' as an aggregate / process-per-thread holding pending clarifications** → Template classification Service + domain events + a transcript Projection (pending-clarification is a small per-thread record)
  - Classification has no identity/lifecycle/invariants — it emits ACTION transcript entries. Per the template's 'question every aggregate' rule it defaults to a Service, not an AggregateRoot.
- **'ProviderCatalog' and 'StopPolicyConfig' as aggregates** → Go detection Service + thin config (providers); a global settings row or code enum + config (stop policy)
  - Neither has real invariants or lifecycle. Fixed detection results and global toggles are config/Service, not persisted aggregates.
- **Inline TS types/unions (ContactRef, Participant, MentionGate, IssueLabel, Stop, TerminalLine + all status unions)** → Template Value Objects + contracts-wire Enums (pgEnum-paired, single-sourced)
  - The template's schema layer-boundary rules make these VOs and closed Enums from contracts, not ad-hoc types redefined per layer. Author them in the Phase-0 contract lock.
- **Screens T01–T15 as free-standing 'Read Models'** → Template ui/BFF Query use cases reading Projections via Drizzle (cross-context T04 → ui/projections)
  - Reads that span contexts are the template's BFF Query pattern, not a new read-model layer. IssuesOverview spanning threads is the exact cross-aggregate/cross-context projection case.
- **In-process desktop 'Scheduler' firing AutoArchiveCompletedIssues (24h)** → Template scheduled Job pattern (BillingClockJob/WindowReconcileJob outbox-driven sweep)
  - A periodic sweep is already a solved shape in the template; don't invent a bespoke scheduler tick.
- **NFR 'redeliver missed inbound messages exactly once' (undesigned)** → the clinical fork deterministic UUIDv5 event ids + outbox ON CONFLICT DO NOTHING + projector dedup on (channel_id, platform_message_id) + template IdempotencyScope
  - Exactly-once is already realized as at-least-once + idempotent sinks. Reuse the deterministic-id/outbox machinery instead of designing a new dedup/offset/ack layer.
- **Real-time streaming 'needs a push/subscription transport unlike request/response SDK'** → Template SSE seam (ListenEvents broadcaster + useServerEvents hook) + whatscode AgentStreamRegistry
  - The template already streams events to the browser over SSE and invalidates query keys; TerminalOutputAppended/AgentReplyDrafted/StopRaised ride this seam. No new websocket layer.
- **'Conformist adapter' as a brand-new agent-runtime port for provider CLIs** → whatscode LlmRunner generate()/stream() interface + AgentStreamRegistry + two-stream frame/fact split
  - The runtime abstraction, streaming registry, and transport-vs-domain-fact separation already exist and are tested; the CLI/PTY driver implements the same interface. Only the subprocess/PTY body and permission-prompt layer are net-new.
- **BC1 Channel Gateway described from first principles as 'Generic ACL over platform APIs'** → the clinical fork gateway.Channel port + ChannelFactory/Registry + whatsmeow mapper (the ACL already exists and is domain-clean)
  - The gateway is the single most transplantable asset — extend its Platform seam for IG/Telegram rather than re-designing the ACL boundary.
- **Abstract 'rotating 30s pairing token' pairing contract** → the clinical fork GetQRChannel (3-min ctx) + WhatsAppQRCodeUpdated→SSE + purgeStaleDevices
  - The realized QR/pairing flow already pushes codes two ways (sync return + SSE) and handles half-paired device cleanup; the doc's token-rotation is just its platform-neutral wrapper.

## Contract draft (to freeze)

- `integration.channel_message.received` (integration-event, from clinical-fork-channel): { ownerId, channelId, messageId, contactRef{channelId,externalId,displayName,kind}, senderExternalId, isGroup, text, quotedEntryId?, platform, receivedAt }
- `integration.channel.connected` (integration-event, from clinical-fork-channel): { ownerId, channelId, kind:ChannelKind, accountDetail, pairedAt }
- `integration.channel.disconnected` (integration-event, from clinical-fork-channel): { ownerId, channelId, kind:ChannelKind, affectedThreadIds:string[] }
- `integration.channel.pairing_qr_updated` (integration-event, from clinical-fork-channel): { ownerId, channelId, kind:ChannelKind, qrPayload, qrExpiresAt } (descends WhatsAppQRCodeUpdated; drives T06 live QR over SSE)
- `integration.channel.outbound_delivered` (integration-event, from clinical-fork-channel): { ownerId, channelId, contactRef, label?:IssueLabel, senderIdentity:'AGENT'|'ROUTER'|'OPERATOR', deliveredAt } (descends channel.message_sent optimistic emit)
- `core→gateway: DeliverOutboundMessage` (integration-event, from new): { channelId, contactRef, text, label?:{issueKey,threadId}, senderIdentity } — BC4→BC1; label prefix applied on agent replies. (In the clinical fork this is an HTTP send call; keep as HTTP-to-gateway or model as command-event.)
- `integration.thread.attached` (integration-event, from new): { ownerId, threadId, contactRef, workspaceId, providers:ProviderName[] } — BC4→BC5 warms workspace indexing
- `integration.message.classified` (integration-event, from new): { ownerId, threadId, entryId, method:ClassificationMethod, issueId? } — BC4→BC5 route into issue context
- `integration.issue.opened` (integration-event, from new): { ownerId, issueId, threadId, key, title, provider:ProviderName } — BC5→BC4 transcript/status; triggers PTY spawn
- `integration.issue.completed` (integration-event, from new): { ownerId, issueId, threadId, key, completedAt } — BC5→BC4; starts 24h auto-archive clock
- `integration.agent.reply_drafted` (integration-event, from whatscode): { ownerId, issueId, threadId, label:IssueLabel, text } — BC5→BC4→BC1 (descends whatscode ChatMessageEvent; carries issue label for delivery)
- `integration.issue.stop_raised` (integration-event, from new): { ownerId, stopId, issueId, threadId, kind:StopKind } — BC5→BC4 flips thread NEEDS_ATTENTION, dock badge, Home callout
- `integration.issue.stop_resolved` (integration-event, from new): { ownerId, stopId, issueId, resolution:StopResolution } — TAKE_OVER additionally pauses thread
- `integration.issue.archived` (integration-event, from new): { ownerId, issueId, threadId, reason:ArchiveReason } — BC5→BC4 issue-list projections
- `integration.artifact.recorded` (integration-event, from new): { ownerId, artifactId, threadId, issueId?, kind:ArtifactKind, name } — BC5→BC6
- `integration.workspace.removed` (integration-event, from new): { ownerId, workspaceId, path } — BC2→BC4/BC5 invalidate refs
- `ChannelKind` (enum, from clinical-fork-channel): WHATSAPP | INSTAGRAM_DM | TELEGRAM (descends the clinical fork Platform{WHATSAPP,INTERNAL}; add IG/Telegram variants). pgEnum-paired in contracts wire
- `ChannelStatus` (enum, from clinical-fork-channel): DISCONNECTED | PAIRING | CONNECTED (descends the clinical fork channel status)
- `ProviderName` (enum, from new): CLAUDE_CODE | CODEX | OPENCODE
- `ProviderStatus` (enum, from new): DETECTED | NOT_INSTALLED
- `ThreadStatus` (enum, from new): RUNNING | IDLE | NEEDS_ATTENTION | PAUSED (derived from issue statuses — derivation undesigned)
- `IssueStatus` (enum, from new): NEEDS_INPUT | WORKING | COMPLETED (richer than whatscode ChatSessionStatus{ACTIVE,CLOSED})
- `StopKind` (enum, from new): SERVER_ERROR | BLOCKED_BY_CLASSIFICATION | HUMAN_REQUESTED | APPROVAL_NEEDED
- `StopResolution` (enum, from new): RETRY | REVIEW_AND_SEND | TAKE_OVER | APPROVE | DENY (must match stop kind)
- `ClassificationMethod` (enum, from new): REPLY_QUOTE | CONTEXT_MATCH | NEW_ISSUE | CLARIFIED
- `ArtifactKind` (enum, from new): IMAGE | FILE | LINK
- `TranscriptKind` (enum, from whatscode): CONTACT | AGENT | OPERATOR_DIRECT | WHISPER | ACTION (pattern from whatscode ChatEvent subtypes Message/ToolCall/Action)
- `browser.terminal_output_appended` (browser-sse-event, from template): { issueId, line, at } — high-frequency stream to T12 terminal panel via ListenEvents/useServerEvents (transport stream, NOT a domain fact)
- `browser.thread_status_changed` (browser-sse-event, from template): { threadId, status:ThreadStatus, agentsRunningNow } — live 'N agents running' pill + session status (T03/T09)
- `browser.stop_raised` (browser-sse-event, from template): { threadId, threadDisplayName, issueId, issueKey, stopKind:StopKind } — live Needs-You callout + dock badge (T03/T14)

## New from scratch

- Desktop shell (Tauri recommended, or Electron) hosting the appReact webview — the single largest build-out; zero in-repo prefiguration.
- Native bridge: OS keychain read/write, native folder-picker (C05), dock badge, launch-at-login, notification sounds — all shell-layer OS integration with no source.
- Terminal session engine: PTY spawn / stream / teardown, one per issue, on the thread's workspace folder with the selected provider CLI (C21, TERMINAL_SPAWN_FAILED). No PTY/subprocess exists in any source.
- Provider CLI Conformist adapter: how each of claude-code/codex/opencode is invoked, how prompts+repo/workspace context are constructed, how AgentReplyDrafted is produced. (whatscode's LlmRunner is the interface; the CLI body is new.)
- Provider CLI detection: PATH + known-install-dir probing, binary path/version/status (C07). whatscode ModelRegistry resolves LLM model strings — not a CLI probe.
- Message classification engine: reply-quote > context-match ≥ threshold > new-issue > clarification, <2s median. Threshold/model/heuristic entirely undesigned; no source has message→issue triage.
- Issue-key slug generation from a request (unique per thread, e.g. 'coupon-focus', 'pix-payment') — algorithm undefined.
- Reply-quote authoritative routing + IssueLabel published-language protocol ('the label is the protocol') prefixed on every agent outbound — new demux mechanic.
- Context buffer semantics: rolling per-thread N∈{25,50,100,200}, unconditional append even from read-only participants, whisper fan-out to every active issue's agent context — mechanics undefined.
- Human-in-the-loop stop control plane: Stop primitives, per-kind resolutions, TAKE_OVER→pause, listing multiple simultaneous stops (T14). No approval/permission-gating layer exists in whatscode.
- Instagram DM and Telegram channel adapters (only WhatsApp/whatsmeow is realized; QR/OAuth pairing + webhook-vs-store ingestion differ per platform).
- Git-repo + Claude-project workspace badge detection and absolute-path dedupe (BC2 FS work).
- Auto-archive 24h issue lifecycle + ArchiveReason (MANUAL/AUTO_24H/THREAD_DETACHED) — Job pattern is template, the rule is new.
- Demo-data seed mode ('Explore with demo data' / 'Demo data loaded' toast) and first-run onboarding/checklist content (T01/T02).
- Monochrome desktop design system (black/white/light-gray, black as sole action color, fully-rounded pills, bold-uppercase display headings, monospace paths/keys/terminals, fixed left sidebar + live agents-running pill) — Linear/iA/macOS register; new SYSTEM.md.

## Sources — pinned refs

Reference repos read for JUDGEMENT, never for bytes (`GOAL-agent-abstraction.md` §6.1: the clinical fork is
a read reference in the shadcn sense, not a dependency — `<fork-clinico>/sync.yaml` carries zero lines of
runtime code and neither repo runs `bun sync:check` in CI). Every file in the agent context that was
born from reading one of these carries a `// CONTEXT-ORIGIN:` comment naming the file and this pin.

| Repo | Path on disk | Pin (40 hex) | Branch @ read | Read for |
|---|---|---|---|---|
| clinical fork | `<fork-clinico>/monorepo` | `c58ed45677c473b0415c03cfc741fea3a00946f4` | `dev` | `agent/` context: `AgentInputSchemaConstraint` + `BaseAgentInput` + `z.agentInput()` (the constraint-erasure technique), `ChatToolCallEvent` (one event per tool invocation carrying the whole lifecycle), `ChatEventStatus` (terminal-only statuses), the one-directory-per-agent layout, and the `AgUiFrameEvent` judgement (ONE opaque wrapper per transport frame, never a class per frame type). |

Recorded for **AC-1.9** (GOAL-agent-abstraction Fase 1). What was adopted and what was deliberately
NOT adopted is enumerated in §6.2 / §6.3 of that goal — in one line: the LEXICON converges, the
RUNTIME SEAM does not, because the two repos answer "who runs the tool loop" in opposite ways.
