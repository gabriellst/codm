# DDD Strategic Modeling — CodeDM

> **CodeDM** — DM your codebase like it's any DM platform.
> A macOS/Windows desktop app that connects messaging channels (WhatsApp, Instagram DM, Telegram) to terminal coding agents (Claude Code, Codex, OpenCode) running locally. Open source, no accounts, everything stays on the operator's machine.

---

## 1. High-Level Requirements

### 1.1 Problem Overview

Developers and small teams receive work requests through everyday messaging apps, while the actual work happens in terminal coding agents on a workstation. CodeDM bridges the two: it pairs messaging channels to the desktop, binds contacts/groups ("threads") to local project folders ("workspaces") and agent providers, classifies each incoming message into an **issue** (a unit of work with its own terminal session), lets agents reply autonomously into the channel with an issue label, and gives the operator a control plane — pause, steering whispers, mention gates, participant permissions, stop criteria and approvals.

### 1.2 Functional Requirements

**Channel connectivity**
- Pair WhatsApp, Instagram DM and Telegram via QR-code / OAuth-style pairing flows; show connection health.
- Ingest each channel's single message stream and deliver agent replies back to the correct conversation, prefixed with an issue label.
- Disconnect and re-pair channels at any time.

**Workspaces**
- Register local project folders via the native folder picker; auto-detect `git` repositories and Claude projects.
- Remove workspaces that are no longer used.

**Agent providers**
- Detect installed provider CLIs (Claude Code, Codex, OpenCode) with binary path and version; mark missing providers.
- Choose a default provider for new threads.

**Threads (contact ↔ workspace ↔ agents binding)**
- Attach a contact, group or inbox to one workspace and one or more providers via a guided wizard (fullscreen or side-panel).
- Pause/resume all agent activity per thread.
- Mention gate: optionally respond only when a configured `@tag` is written.
- Participants: list everyone in the conversation and choose who can invoke agents; everyone's messages still land in a configurable rolling **context buffer** (25/50/100/200 messages) that agents can read.
- Operator composer is mode-aware: while agents are live, typed text is a **whisper** (steer) injected into agent context and never sent to the channel; when the thread is paused, the operator talks **directly** as themselves on the channel.

**Issues (concurrent executions inside one thread)**
- Because channels are single-stream, every inbound message is **classified**: matched to an existing open issue, opened as a new issue, or — when ambiguous — answered with a **clarification question**; a channel reply-quote to an agent message routes deterministically.
- Each issue owns a terminal session; agents respond per-issue with the issue key as a label on the outgoing message.
- Issue lifecycle: needs input → working → completed; manual archive and auto-archive of completed issues after 24 hours; archived issues can be restored.
- Issue-scoped steering: whispers can target a single issue.
- Cross-thread **Issues overview** shows all issues grouped by status with their thread of origin.

**Stop criteria (human-in-the-loop)**
- Agents stop and flag the thread "Needs you" on: server errors (API limits/outages), replies blocked by classification, a participant requesting a human, or an action requiring approval.
- Each stop is resolved explicitly: retry, review & send, take over, approve or deny.
- Which criteria are active is configurable in Settings.

**Artifacts**
- Non-code outputs produced by agents (images, files, links/preview deploys) are recorded per thread and browsable.

**Operator console**
- Home dashboard: agents running now, "needs you" callout, active sessions, latest activity, today's metrics (issues opened/closed, median response), channel health, quick actions.
- First-run experience: 3-slide onboarding and a setup checklist (connect channel → add workspace → attach thread).

### 1.3 Non-Functional Requirements

- **Local-first:** all state (threads, transcripts, buffers, terminal logs) lives on the operator machine; no cloud account, no gates.
- **Open source:** auditable message handling; secrets (provider keys, channel sessions) stored in the OS keychain.
- **Responsiveness:** classification decision < 2 s median so replies feel conversational.
- **Reliability:** channel adapters must survive restarts and re-deliver missed inbound messages exactly once.
- **Concurrency:** many issues per thread and many threads execute in parallel; one terminal session per issue.
- **Auditability:** every classification decision, steer, stop and resolution is recorded on the transcript.
- **Extensibility:** new channel adapters and providers pluggable behind stable ports.

---

## 2. Brainstorming — Event Storming

### 2.1 Legend

| Marker | Meaning |
|---|---|
| 🟧 | Domain Event |
| 🟦 | Command |
| 🟨 | Aggregate |
| 🟪 | Policy / Reaction |
| 🟩 | Read Model |
| 🟥 | Hot Spot |
| 👤 | Actor |

### 2.2 Main Flow — Domain Events Timeline

```
═══════════════════════════════════════════════════════════════════
 CHANNEL CONNECTIVITY
═══════════════════════════════════════════════════════════════════

👤 Operator
  🟦 StartChannelPairing
    🟨 Channel
      🟧 ChannelPairingStarted
        🟪 Policy: render QR / open provider login; rotate code every 30 s
  🟦 CompleteChannelPairing
    🟨 Channel
      🟧 ChannelConnected
        🟩 Channels list refreshes health
  🟦 DisconnectChannel
    🟨 Channel
      🟧 ChannelDisconnected
        🟥 Hot Spot: in-flight replies for threads on this channel must be parked

═══════════════════════════════════════════════════════════════════
 WORKSPACES & PROVIDERS
═══════════════════════════════════════════════════════════════════

👤 Operator
  🟦 AddWorkspace
    🟨 Workspace
      🟧 WorkspaceAdded
        🟪 Policy: scan folder → detect git repo / Claude project badges
  🟦 RemoveWorkspace
    🟨 Workspace
      🟧 WorkspaceRemoved
        🟥 Hot Spot: block removal while issues on this workspace are working
  🟦 RescanProviders
    🟨 ProviderCatalog
      🟧 ProvidersRescanned
  🟦 SetDefaultProvider
    🟨 ProviderCatalog
      🟧 DefaultProviderChanged

═══════════════════════════════════════════════════════════════════
 THREAD LIFECYCLE & CONTROL PLANE
═══════════════════════════════════════════════════════════════════

👤 Operator
  🟦 AttachThread (contact + workspace + providers)
    🟨 Thread
      🟧 ThreadAttached
        🟪 Policy: warm up — index workspace, start context buffer
  🟦 PauseThread / 🟦 ResumeThread
    🟨 Thread
      🟧 ThreadPaused / 🟧 ThreadResumed
        🟪 Policy: paused → composer flips to direct mode; agents mute
  🟦 ConfigureMentionGate
    🟨 Thread
      🟧 MentionGateConfigured
  🟦 SetParticipantInvocation
    🟨 Thread
      🟧 ParticipantInvocationChanged
  🟦 ConfigureContextBuffer
    🟨 Thread
      🟧 ContextBufferConfigured
  🟦 DetachThread
    🟨 Thread
      🟧 ThreadDetached

═══════════════════════════════════════════════════════════════════
 MESSAGE INGESTION, CLASSIFICATION & ROUTING (single-stream channels)
═══════════════════════════════════════════════════════════════════

👤 Channel Adapter (system)
  🟦 IngestChannelMessage
    🟨 Thread
      🟧 MessageIngested
        🟪 Policy: always append to context buffer (even read-only participants)
        🟪 Policy: skip invocation if sender cannot invoke, gate tag missing, or thread paused
  🟦 ClassifyMessage
    🟨 Router
      🟧 MessageClassified (matchedExistingIssue | openedNewIssue | routedViaReplyQuote)
        🟪 Policy: openedNewIssue → OpenIssue in Issue Execution
      🟧 ClarificationRequested (when ambiguous)
        🟪 Policy: send clarification question to channel; next reply-quote resolves routing
        🟥 Hot Spot: mis-routing to the wrong issue — reply-quotes are authoritative

👤 Operator
  🟦 SteerThread (whisper — agents-only)
    🟨 Thread
      🟧 ThreadSteered
        🟪 Policy: inject into every active issue's agent context; never sent to channel
  🟦 SendDirectMessage (only while paused)
    🟨 Thread
      🟧 DirectMessageSent
        🟪 Policy: deliver via Channel Gateway as the operator

═══════════════════════════════════════════════════════════════════
 ISSUE EXECUTION (one terminal session per issue)
═══════════════════════════════════════════════════════════════════

👤 Router (system)
  🟦 OpenIssue
    🟨 Issue
      🟧 IssueOpened
        🟪 Policy: spawn terminal session on the thread's workspace with selected provider
👤 Agent Runtime (system)
      🟧 TerminalOutputAppended
      🟧 AgentReplyDrafted
        🟪 Policy: label reply with issue key → DeliverOutboundMessage
  🟦 CompleteIssue
    🟨 Issue
      🟧 IssueCompleted
        🟪 Policy: schedule auto-archive at completedAt + 24 h
👤 Operator
  🟦 SteerIssue (issue-scoped whisper)
    🟨 Issue
      🟧 IssueSteered
  🟦 ArchiveIssue / 🟦 RestoreIssue
    🟨 Issue
      🟧 IssueArchived / 🟧 IssueRestored
👤 Scheduler (system)
  🟦 AutoArchiveCompletedIssues
    🟨 Issue
      🟧 IssueArchived (reason: "AUTO_24H")

═══════════════════════════════════════════════════════════════════
 STOP CRITERIA — HUMAN NEEDED
═══════════════════════════════════════════════════════════════════

👤 Agent Runtime / Classifier / Participant (system)
  🟦 RaiseStop (SERVER_ERROR | BLOCKED_BY_CLASSIFICATION | HUMAN_REQUESTED | APPROVAL_NEEDED)
    🟨 Issue
      🟧 StopRaised
        🟪 Policy: thread status → NEEDS_ATTENTION; dock badge; Home callout
        🟥 Hot Spot: multiple simultaneous stops per thread must all be listed
👤 Operator
  🟦 ResolveStop (RETRY | REVIEW_AND_SEND | TAKE_OVER | APPROVE | DENY)
    🟨 Issue
      🟧 StopResolved
        🟪 Policy: TAKE_OVER also pauses the thread for direct conversation
  🟦 UpdateStopCriteriaConfig
    🟨 StopPolicyConfig
      🟧 StopCriteriaConfigUpdated

═══════════════════════════════════════════════════════════════════
 ARTIFACTS
═══════════════════════════════════════════════════════════════════

👤 Agent Runtime (system)
  🟦 RecordArtifact (image | file | link)
    🟨 ArtifactRegistry
      🟧 ArtifactRecorded
        🟩 Artifacts tab refreshes
```

### 2.3 Pivotal Events

1. **ChannelConnected** — the desktop becomes reachable from the messaging world; threads become possible.
2. **ThreadAttached** — a conversation is bound to a workspace + providers; autonomous operation begins.
3. **MessageClassified** — the single channel stream is demultiplexed into a concrete issue; everything downstream is issue-scoped.
4. **IssueOpened** — a terminal session exists; agents can act on the codebase.
5. **StopRaised** — autonomy is suspended for that issue; the human control plane takes precedence.
6. **IssueCompleted** — work is done, replies delivered; the 24 h auto-archive clock starts.

---

## 3. Screens & Commands Definition

### 3.1 Screens (Read Models)

| # | Screen | Description | Data Displayed |
|---|---|---|---|
| T01 | Onboarding | 3-slide first-run intro (value prop, how it works, control plane) | slides, channel/provider glyphs, progress dots |
| T02 | Setup Checklist (first-run Home) | Empty-state Home with 3-step checklist | step status (channel/workspace/thread), replay intro, load demo |
| T03 | Home Dashboard | Operating overview | agents running, needs-you callout, active sessions, latest activity, today metrics, channel health, quick actions |
| T04 | Issues Overview | All issues across every thread | grouped by status, thread of origin, meta, archived section |
| T05 | Channels | Connected channels and health | channel, account detail, status |
| T06 | Connect Channel | Channel picker + QR pairing | connectable channels, QR code, pairing instructions |
| T07 | Workspaces | Registered project folders | path, badges (git / Claude project), thread count |
| T08 | Settings | Providers, stop criteria, general prefs | provider detection, default provider, stop-criteria toggles, attach-flow style, general toggles |
| T09 | Session — Chat | Full thread conversation | bubbles (contact/agent/operator/whisper), issue labels, classification/action lines, mode-aware composer |
| T10 | Thread Settings | Per-thread behavior modal | respond trigger (mention gate), participants + invocation, context buffer size |
| T11 | Session — Issues | Issues of one thread | status groups with counts line, archived list, auto-archive note |
| T12 | Issue Detail | One issue drill-down | title, status, terminal session log, messages routed here, issue-scoped steer composer, archive |
| T13 | Session — Artifacts | Non-code outputs of a thread | artifact cards (image/file/link) with meta |
| T14 | Needs You (stops panel) | Active stops on a session | stop kind, title, detail, per-kind resolution actions |
| T15 | Attach Thread Wizard | Guided binding flow | steps: contact → workspace → agents → review → success (fullscreen or side panel) |

### 3.2 Commands

| # | Command | Actor | Aggregate | Resulting Event | Rules |
|---|---|---|---|---|---|
| C01 | StartChannelPairing | Operator | Channel | ChannelPairingStarted | one pairing at a time per channel; QR rotates every 30 s |
| C02 | CompleteChannelPairing | Channel Adapter | Channel | ChannelConnected | pairing token must be current |
| C03 | DisconnectChannel | Operator | Channel | ChannelDisconnected | parks threads on that channel |
| C04 | DeliverOutboundMessage | System | Channel | OutboundMessageDelivered | channel must be CONNECTED; label prefix applied for agent replies |
| C05 | AddWorkspace | Operator | Workspace | WorkspaceAdded | path must exist locally; dedupe by absolute path |
| C06 | RemoveWorkspace | Operator | Workspace | WorkspaceRemoved | forbidden while issues are WORKING on it |
| C07 | RescanProviders | Operator | ProviderCatalog | ProvidersRescanned | scans PATH + known install dirs |
| C08 | SetDefaultProvider | Operator | ProviderCatalog | DefaultProviderChanged | provider must be DETECTED |
| C09 | AttachThread | Operator | Thread | ThreadAttached | needs connected channel, existing workspace, ≥1 detected provider |
| C10 | PauseThread | Operator | Thread | ThreadPaused | idempotent |
| C11 | ResumeThread | Operator | Thread | ThreadResumed | idempotent |
| C12 | ConfigureMentionGate | Operator | Thread | MentionGateConfigured | tag required when enabling |
| C13 | SetParticipantInvocation | Operator | Thread | ParticipantInvocationChanged | at least one invoker must remain |
| C14 | ConfigureContextBuffer | Operator | Thread | ContextBufferConfigured | size ∈ {25,50,100,200} |
| C15 | DetachThread | Operator | Thread | ThreadDetached | archives all open issues first |
| C16 | IngestChannelMessage | Channel Adapter | Thread | MessageIngested | always buffered; invocation gated by pause/mention/permission |
| C17 | ClassifyMessage | Router | Router | MessageClassified | reply-quote > context match > new issue; ambiguous → C18 |
| C18 | RequestClarification | Router | Router | ClarificationRequested | max 1 open clarification per sender |
| C19 | SteerThread | Operator | Thread | ThreadSteered | thread must not be paused; never delivered to channel |
| C20 | SendDirectMessage | Operator | Thread | DirectMessageSent | thread must be PAUSED |
| C21 | OpenIssue | Router | Issue | IssueOpened | spawns terminal session; key unique per thread |
| C22 | SteerIssue | Operator | Issue | IssueSteered | issue must not be ARCHIVED |
| C23 | CompleteIssue | Agent Runtime | Issue | IssueCompleted | starts 24 h auto-archive timer |
| C24 | RaiseStop | System | Issue | StopRaised | only if criterion enabled in StopPolicyConfig |
| C25 | ResolveStop | Operator | Issue | StopResolved | resolution must match stop kind |
| C26 | ArchiveIssue | Operator | Issue | IssueArchived | any status; hides from active lists |
| C27 | RestoreIssue | Operator | Issue | IssueRestored | archived only |
| C28 | AutoArchiveCompletedIssues | Scheduler | Issue | IssueArchived | COMPLETED and completedAt ≤ now − 24 h |
| C29 | UpdateStopCriteriaConfig | Operator | StopPolicyConfig | StopCriteriaConfigUpdated | global config |
| C30 | RecordArtifact | Agent Runtime | ArtifactRegistry | ArtifactRecorded | kind ∈ {IMAGE,FILE,LINK} |

---

## 4. Bounded Context Separation

Contexts are split along ownership of language and change rate: channel plumbing changes with external platforms, routing changes with product policy, execution changes with agent capabilities.

### BC1: Channel Gateway

**Responsibility:** Own connectivity to messaging platforms — pairing, inbound normalization, outbound delivery with issue labels.
**Ubiquitous Language:** Channel, Pairing, QR Code, Inbound Message, Outbound Delivery, Label Prefix, Health.

**Aggregates:**
- `Channel` — `channelId: string`, `kind: ChannelKind`, `status: ChannelStatus`, `accountDetail: string`, `pairedAt?: string`. Invariant: one active pairing at a time.

**Screens:** T05, T06
**Commands:** C01–C04

**Published Events:** `ChannelPairingStarted`, `ChannelConnected`, `ChannelDisconnected`, `InboundMessageReceived`, `OutboundMessageDelivered`

**Command Execution Behavior:**
- **C01 – StartChannelPairing:** validates channel is DISCONNECTED, creates a rotating pairing token (30 s TTL), publishes `ChannelPairingStarted` with QR payload.
- **C02 – CompleteChannelPairing:** adapter confirms the scan; validates token freshness; sets status CONNECTED; publishes `ChannelConnected`.
- **C03 – DisconnectChannel:** tears the session down, publishes `ChannelDisconnected`; downstream Thread & Routing parks affected threads.
- **C04 – DeliverOutboundMessage:** requires CONNECTED; when `labelKey` is present, prefixes the text with the issue label; publishes `OutboundMessageDelivered`.

**Classification:** Generic (platform plumbing).

### BC2: Workspace Registry

**Responsibility:** Catalog of local project folders and their detected traits.
**Ubiquitous Language:** Workspace, Folder, Badge, Git Repo, Claude Project.

**Aggregates:**
- `Workspace` — `workspaceId: string`, `path: string`, `badges: WorkspaceBadge[]`, `addedAt: string`. Invariant: absolute path unique.

**Screens:** T07
**Commands:** C05, C06

**Published Events:** `WorkspaceAdded`, `WorkspaceRemoved`

**Command Execution Behavior:**
- **C05 – AddWorkspace:** verifies the path exists, scans for `.git` and Claude project markers, stores badges, publishes `WorkspaceAdded`.
- **C06 – RemoveWorkspace:** rejects with `WORKSPACE_IN_USE` while any issue on it is `"WORKING"`; otherwise publishes `WorkspaceRemoved`.

**Classification:** Support.

### BC3: Provider Registry

**Responsibility:** Detection and selection of agent provider CLIs.
**Ubiquitous Language:** Provider, CLI Binary, Version, Detection, Default Provider.

**Aggregates:**
- `ProviderCatalog` — `providers: { name: ProviderName; binaryPath?: string; version?: string; status: ProviderStatus }[]`, `defaultProvider: ProviderName`.

**Screens:** part of T08
**Commands:** C07, C08

**Published Events:** `ProvidersRescanned`, `DefaultProviderChanged`

**Command Execution Behavior:**
- **C07 – RescanProviders:** probes PATH and known install locations; updates status DETECTED/NOT_INSTALLED; publishes `ProvidersRescanned`.
- **C08 – SetDefaultProvider:** rejects `PROVIDER_NOT_DETECTED`; publishes `DefaultProviderChanged`.

**Classification:** Support.

### BC4: Thread & Routing (Core)

**Responsibility:** The binding of a conversation to a workspace and providers, its control plane (pause, mention gate, participants, buffer), the transcript, and the demultiplexing of the single channel stream into issues.
**Ubiquitous Language:** Thread, Participant, Invoker, Mention Gate, Context Buffer, Whisper (Steer), Direct Message, Classification, Clarification, Reply-Quote Routing, Transcript.

**Aggregates:**
- `Thread` — `threadId: string`, `channelId: string`, `contactRef: ContactRef`, `workspaceId: string`, `providers: ProviderName[]`, `paused: boolean`, `mentionGate: MentionGate`, `participants: Participant[]`, `bufferSize: BufferSize`, `status: ThreadStatus`. Invariants: ≥1 invoker; providers non-empty; direct messages only while paused.
- `Router` (process/aggregate per thread) — pending clarifications `{ messageId, question, askedAt }[]`. Invariant: max one open clarification per sender.
- `TranscriptEntry` (entity within Thread) — `kind: TranscriptKind`, `text`, `issueId?`, `quotedMessageId?`, `provider?`, `at`.

**Screens:** T09, T10, T15 (plus T02/T03 composition)
**Commands:** C09–C20

**Published Events:** `ThreadAttached`, `ThreadDetached`, `ThreadPaused`, `ThreadResumed`, `MentionGateConfigured`, `ParticipantInvocationChanged`, `ContextBufferConfigured`, `MessageIngested`, `MessageClassified`, `ClarificationRequested`, `ThreadSteered`, `DirectMessageSent`

**Command Execution Behavior:**
- **C09 – AttachThread:** validates channel CONNECTED, workspace exists, each provider DETECTED; seeds participants from the channel roster with the operator as invoker; publishes `ThreadAttached` (Issue Execution warms up indexing).
- **C10/C11 – PauseThread/ResumeThread:** flips `paused`; composer mode and agent muting react; publishes `ThreadPaused`/`ThreadResumed`.
- **C12 – ConfigureMentionGate:** enabling requires non-empty `tag`; publishes `MentionGateConfigured`.
- **C13 – SetParticipantInvocation:** toggling the last invoker off is rejected with `LAST_INVOKER`; publishes `ParticipantInvocationChanged`.
- **C14 – ConfigureContextBuffer:** size must be a valid `BufferSize`; publishes `ContextBufferConfigured`.
- **C15 – DetachThread:** archives open issues via Issue Execution, then publishes `ThreadDetached`.
- **C16 – IngestChannelMessage:** appends to buffer and transcript unconditionally; evaluates invocation gates (paused? sender can invoke? mention tag present when gate on?); when invocable, hands off to C17; publishes `MessageIngested`.
- **C17 – ClassifyMessage:** resolution order — (1) reply-quote to a labeled agent message routes to that issue; (2) context match against open issues; (3) open a new issue (delegates C21); ambiguity below confidence threshold delegates C18. Publishes `MessageClassified { method }`.
- **C18 – RequestClarification:** sends a disambiguation question through C04; records pending clarification; publishes `ClarificationRequested`.
- **C19 – SteerThread:** rejects when paused (`THREAD_PAUSED` — use direct mode); appends a whisper transcript entry visible only in-app; fans out to all active issues' agent contexts; publishes `ThreadSteered`.
- **C20 – SendDirectMessage:** rejects unless paused (`THREAD_NOT_PAUSED`); delivers via C04 as the operator identity; publishes `DirectMessageSent`.

**Classification:** Core.

### BC5: Issue Execution (Core)

**Responsibility:** Issues as units of concurrent work — terminal sessions, agent replies, steering, stop criteria and archive lifecycle.
**Ubiquitous Language:** Issue, Issue Key, Terminal Session, Steer, Stop, Stop Criterion, Resolution, Archive, Auto-Archive.

**Aggregates:**
- `Issue` — `issueId: string`, `threadId: string`, `key: string`, `title: string`, `status: IssueStatus`, `provider: ProviderName`, `meta?: string`, `archived: boolean`, `completedAt?: string`, `stops: Stop[]`, `terminalLog: TerminalLine[]`. Invariants: key unique within thread; stops only while not archived.
- `StopPolicyConfig` — `{ serverErrors: boolean; blockedByClassification: boolean; humanRequested: boolean; approvalNeeded: boolean }` (global).

**Screens:** T04, T11, T12, T14
**Commands:** C21–C29

**Published Events:** `IssueOpened`, `IssueSteered`, `IssueCompleted`, `StopRaised`, `StopResolved`, `IssueArchived`, `IssueRestored`, `StopCriteriaConfigUpdated`, `AgentReplyDrafted`, `TerminalOutputAppended`

**Command Execution Behavior:**
- **C21 – OpenIssue:** generates a slug key from the request, spawns a terminal session on the thread's workspace with the selected provider, status `"NEEDS_INPUT"` or `"WORKING"`; publishes `IssueOpened`.
- **C22 – SteerIssue:** appends the whisper to that issue's agent context and terminal log; rejects `ISSUE_ARCHIVED`; publishes `IssueSteered`.
- **C23 – CompleteIssue:** status → `"COMPLETED"`, stamps `completedAt`, schedules auto-archive; publishes `IssueCompleted`.
- **C24 – RaiseStop:** only when the criterion is enabled in `StopPolicyConfig`; appends a `Stop`; publishes `StopRaised` (Thread & Routing flips thread to NEEDS_ATTENTION).
- **C25 – ResolveStop:** validates resolution matches the stop kind (`APPROVE`/`DENY` only for `"APPROVAL_NEEDED"`, etc.); removes the stop; `TAKE_OVER` additionally issues C10; publishes `StopResolved`.
- **C26/C27 – ArchiveIssue/RestoreIssue:** flips `archived`; publishes `IssueArchived`/`IssueRestored`.
- **C28 – AutoArchiveCompletedIssues:** scheduler sweep archiving `"COMPLETED"` issues older than 24 h with reason `"AUTO_24H"`.
- **C29 – UpdateStopCriteriaConfig:** updates the global toggles; publishes `StopCriteriaConfigUpdated`.

**Classification:** Core.

### BC6: Artifact Registry

**Responsibility:** Catalog of non-code outputs produced by agents.
**Ubiquitous Language:** Artifact, Kind (Image/File/Link), Preview Deploy.

**Aggregates:**
- `Artifact` — `artifactId: string`, `threadId: string`, `issueId?: string`, `kind: ArtifactKind`, `name: string`, `meta: string`, `recordedAt: string`.

**Screens:** T13
**Commands:** C30

**Published Events:** `ArtifactRecorded`

**Command Execution Behavior:**
- **C30 – RecordArtifact:** validates kind; stores reference (path or URL); publishes `ArtifactRecorded`.

**Classification:** Support.

---

## 5. Context Mapping

### 5.1 Context Map

```
                          ┌──────────────────────────┐
                          │  External Messaging       │
                          │  Platforms (WhatsApp,     │
                          │  Instagram, Telegram)     │
                          └──────┬──────────▲─────────┘
                          inbound│          │outbound (labeled)
                                 ▼          │
                     ┌───────────────────────────────┐
                     │ BC1: Channel Gateway (Generic)│
                     │  ACL against platform APIs    │
                     └──────┬──────────▲─────────────┘
       InboundMessageReceived│          │DeliverOutboundMessage
              (OHS/PL)       ▼          │
                     ┌───────────────────────────────┐        ┌──────────────────────┐
                     │ BC4: Thread & Routing (CORE)  │◄───────│ BC2: Workspace       │
                     │  Thread control plane +       │ U/D    │ Registry (Support)   │
                     │  classification / routing     │        └──────────────────────┘
                     └──────┬──────────▲─────────────┘        ┌──────────────────────┐
             OpenIssue /    │          │AgentReplyDrafted     │ BC3: Provider        │
             RouteToIssue   ▼          │(labeled)             │ Registry (Support)   │
                     ┌───────────────────────────────┐◄───────┴──────────────────────┘
                     │ BC5: Issue Execution (CORE)   │ Conformist (provider CLIs)
                     │  terminal sessions, stops,    │
                     │  archive lifecycle            │──────► ┌──────────────────────┐
                     └──────────────▲────────────────┘ Artifact│ BC6: Artifact        │
                                    │                 Recorded │ Registry (Support)   │
                     ┌──────────────┴────────────────┐        └──────────────────────┘
                     │ External: Agent Provider CLIs │
                     │ (Claude Code, Codex, OpenCode)│
                     └───────────────────────────────┘
```

### 5.2 Context Relationships

| Upstream (U) | Downstream (D) | Relationship | Description |
|---|---|---|---|
| Channel Gateway | Thread & Routing | OHS/PL | Gateway publishes normalized `InboundMessageReceived` in a published language; routing conforms |
| Thread & Routing | Channel Gateway | Customer/Supplier | Routing orders outbound deliveries (labels, clarifications, direct messages) |
| Workspace Registry | Thread & Routing / Issue Execution | U/D (PL) | Workspace ids + paths consumed at attach and session spawn |
| Provider Registry | Thread & Routing / Issue Execution | U/D (PL) | Detected providers validated at attach; binary used at spawn |
| Thread & Routing | Issue Execution | Customer/Supplier | Routing opens issues and forwards routed messages/steers |
| Issue Execution | Thread & Routing | OHS/PL | Replies, stops and completions flow back to the transcript/status |
| Issue Execution | Artifact Registry | U/D (events) | `ArtifactRecorded` on non-code outputs |
| Provider CLIs (external) | Issue Execution | Conformist | We conform to each CLI's invocation contract behind an adapter |
| Messaging platforms (external) | Channel Gateway | ACL | Adapters isolate platform APIs/quirks |

### 5.3 Data Flow Between Contexts (Summary)

```
Platform ► BC1 Gateway ─InboundMessageReceived─► BC4 Thread&Routing
  BC4: buffer append ─► gate check ─► classify ─► (existing issue │ new issue │ clarification)
  BC4 ─OpenIssue/RouteMessage─► BC5 Issue Execution ─spawn─► Provider CLI on Workspace
  BC5 ─AgentReplyDrafted(label)─► BC4 ─DeliverOutboundMessage─► BC1 ─► Platform
  BC5 ─StopRaised─► BC4 (NEEDS_ATTENTION) ─► Operator resolves ─ResolveStop─► BC5
  BC5 ─ArtifactRecorded─► BC6 Artifacts
```

---

## Design Decisions — Demultiplexing Single-Stream Channels into Issues

### Principle: "One conversation, many terminals — the label is the protocol."

Messaging channels offer exactly one message stream per conversation. CodeDM treats that stream as a transport and reconstructs concurrency on top of it: every inbound message is classified into an issue, every outbound agent reply carries the issue key as a visible label, and the channel's native reply-quote becomes the deterministic routing primitive.

### Routing Flow Through the System

```
Inbound message
   │ 1. reply-quote to a labeled agent message?  ──► route to that issue (authoritative)
   │ 2. context match against open issues ≥ threshold? ─► route to best match
   │ 3. looks like new work?                    ──► OpenIssue (new key + terminal)
   └ 4. ambiguous                               ──► ClarificationRequested (ask, then reply-quote resolves)
```

### Routing Value Objects (Published Language)

```typescript
type ClassificationMethod = "REPLY_QUOTE" | "CONTEXT_MATCH" | "NEW_ISSUE" | "CLARIFIED";

type IssueLabel = {
  issueKey: string;      // e.g. "coupon-focus" — prefixed on every outbound agent reply
  threadId: string;
};
```

### Key Rules

1. Reply-quote routing always wins over context matching.
2. Every agent outbound message MUST carry an `IssueLabel`; clarification questions carry none (they belong to the Router).
3. At most one open clarification per sender; a new inbound from that sender first tries to resolve it.
4. Whispers (thread- or issue-scoped) are never delivered to the channel — they only mutate agent context.
5. Every classification decision is appended to the transcript as an action line (auditability).

## Design Decisions — Human Control Plane

### Principle: "Autonomous by default, interruptible by design."

1. **Pause beats everything:** a paused thread mutes all agents and flips the composer to direct mode; the operator speaks as themselves.
2. **Mention gate** narrows invocation without muting observation — the context buffer always fills.
3. **Stop criteria** convert failure modes (server errors, blocked replies, human requests, approvals) into explicit, listed, individually-resolvable stops.
4. **TAKE_OVER** resolution both clears the stop and pauses the thread, handing the conversation to the human.

---

## Bounded Contexts Summary

| Bounded Context | Screens | Commands | Core/Support/Generic |
|---|---|---|---|
| BC1: Channel Gateway | T05, T06 | C01–C04 | Generic |
| BC2: Workspace Registry | T07 | C05, C06 | Support |
| BC3: Provider Registry | T08 (partial) | C07, C08 | Support |
| BC4: Thread & Routing | T09, T10, T15 (+T02/T03) | C09–C20 | **Core** |
| BC5: Issue Execution | T04, T11, T12, T14 | C21–C29 | **Core** |
| BC6: Artifact Registry | T13 | C30 | Support |

---

## 7. Technical Specification — Reads & Commands

> **Conventions:**
> - Optional fields marked with `?`
> - All IDs are `string` (UUID v7)
> - Dates in ISO 8601 strings
> - CodeDM is a local-first, single-operator desktop app: there is no authentication layer, so reads/commands omit `UNAUTHORIZED`/`SESSION_EXPIRED`; `VALIDATION_ERROR` covers malformed input everywhere
> - This domain has no monetary values; no money types are defined
> - Screenshots of the working prototype (`CodeDM.dc.html`) are attached to each Read

### 7.0 Global Enums & Shared Types

```typescript
type ChannelKind = "WHATSAPP" | "INSTAGRAM_DM" | "TELEGRAM";
type ChannelStatus = "DISCONNECTED" | "PAIRING" | "CONNECTED";

type ProviderName = "CLAUDE_CODE" | "CODEX" | "OPENCODE";
type ProviderStatus = "DETECTED" | "NOT_INSTALLED";

type WorkspaceBadge = "GIT" | "CLAUDE_PROJECT";

type ThreadStatus = "RUNNING" | "IDLE" | "NEEDS_ATTENTION" | "PAUSED";
type IssueStatus = "NEEDS_INPUT" | "WORKING" | "COMPLETED";
type BufferSize = 25 | 50 | 100 | 200;

type StopKind =
  | "SERVER_ERROR"
  | "BLOCKED_BY_CLASSIFICATION"
  | "HUMAN_REQUESTED"
  | "APPROVAL_NEEDED";

type StopResolution = "RETRY" | "REVIEW_AND_SEND" | "TAKE_OVER" | "APPROVE" | "DENY";

type ArtifactKind = "IMAGE" | "FILE" | "LINK";
type TranscriptKind = "CONTACT" | "AGENT" | "OPERATOR_DIRECT" | "WHISPER" | "ACTION";
type ClassificationMethod = "REPLY_QUOTE" | "CONTEXT_MATCH" | "NEW_ISSUE" | "CLARIFIED";
type ArchiveReason = "MANUAL" | "AUTO_24H" | "THREAD_DETACHED";
type AttachFlowStyle = "FULLSCREEN" | "SIDE_PANEL";

// Discriminated union — tag is required exactly when the gate is enabled
type MentionGate =
  | { enabled: false }
  | { enabled: true; tag: string };

type ContactRef = {
  channelId: string;
  externalId: string;      // channel-native id (phone, handle, group id)
  displayName: string;
  kind: "CONTACT" | "GROUP";
};

type Participant = {
  participantId: string;
  name: string;
  source: string;          // e.g. "WhatsApp group member", "Operator on this Mac"
  canInvoke: boolean;
};

type Stop = {
  stopId: string;
  kind: StopKind;
  title: string;
  detail: string;
  raisedAt: string;
};

type TerminalLine = {
  at: string;
  line: string;
};

type IssueLabel = {
  issueKey: string;
  threadId: string;
};

type IssueSummary = {
  issueId: string;
  key: string;
  title: string;
  status: IssueStatus;
  meta?: string;           // e.g. "PR #214", "needs repro"
  archived: boolean;
};

type ThreadSummary = {
  threadId: string;
  displayName: string;
  channelKind: ChannelKind;
  workspacePath: string;
  providers: ProviderName[];
  status: ThreadStatus;
  lastActivity: string;
};

type TranscriptEntry = {
  entryId: string;
  kind: TranscriptKind;
  text: string;
  at: string;
  issueId?: string;                // present when routed to an issue
  provider?: ProviderName;         // present for kind "AGENT"
  quotedEntryId?: string;          // present for channel reply-quotes
  classification?: ClassificationMethod; // present on ACTION lines produced by the router
};

type StopPolicyConfig = {
  serverErrors: boolean;
  blockedByClassification: boolean;
  humanRequested: boolean;
  approvalNeeded: boolean;
};
```

### 7.1 BC1: Channel Gateway

![T05 — Channels](screenshots/06-codedm.jpg)

#### Read — Channels (T05)

```typescript
type Input = {};

type Output = {
  channels: {
    channelId: string;
    kind: ChannelKind;
    status: ChannelStatus;
    accountDetail: string;   // masked account / handle / "Not connected"
    threadCount: number;
    pairedAt?: string;
  }[];
};

type Errors = never;
```

![T06 — Connect Channel](screenshots/07-codedm.jpg)

#### Read — ConnectChannel (T06)

```typescript
type Input = {
  channelId: string;
};

type Output = {
  kind: ChannelKind;
  status: ChannelStatus;
  pairingInstructions: string;   // e.g. "Open WhatsApp → Linked devices → scan"
  qrPayload?: string;            // present while status = "PAIRING"; rotates every 30 s
  qrExpiresAt?: string;
};

type Errors =
  | "CHANNEL_NOT_FOUND"
  | "CHANNEL_ALREADY_CONNECTED";
```

#### Command — StartChannelPairing (C01)

```typescript
type Input = {
  channelId: string;
};

type Output = {
  qrPayload: string;
  qrExpiresAt: string;
};

type Errors =
  | "CHANNEL_NOT_FOUND"
  | "CHANNEL_ALREADY_CONNECTED"
  | "PAIRING_ALREADY_IN_PROGRESS"
  | "VALIDATION_ERROR";

// Domain Events:
//   ChannelPairingStarted { channelId, kind, qrExpiresAt }
```

#### Command — CompleteChannelPairing (C02)

```typescript
type Input = {
  channelId: string;
  pairingToken: string;     // provided by the adapter after the QR scan
  accountDetail: string;
};

type Output = void; // 204 No Content

type Errors =
  | "CHANNEL_NOT_FOUND"
  | "PAIRING_TOKEN_EXPIRED"
  | "PAIRING_NOT_IN_PROGRESS"
  | "VALIDATION_ERROR";

// Domain Events:
//   ChannelConnected { channelId, kind, accountDetail, pairedAt }
```

#### Command — DisconnectChannel (C03)

```typescript
type Input = {
  channelId: string;
};

type Output = void; // 204 No Content

type Errors =
  | "CHANNEL_NOT_FOUND"
  | "CHANNEL_NOT_CONNECTED";

// Domain Events:
//   ChannelDisconnected { channelId, kind, affectedThreadIds }
```

#### Command — DeliverOutboundMessage (C04)

```typescript
type Input = {
  channelId: string;
  contactRef: ContactRef;
  text: string;
  label?: IssueLabel;               // present on agent replies; absent on clarifications and operator direct messages
  senderIdentity: "AGENT" | "ROUTER" | "OPERATOR";
};

type Output = void; // 201 Created

type Errors =
  | "CHANNEL_NOT_FOUND"
  | "CHANNEL_NOT_CONNECTED"
  | "DELIVERY_FAILED"
  | "VALIDATION_ERROR";

// Domain Events:
//   OutboundMessageDelivered { channelId, contactRef, label?, senderIdentity, deliveredAt }
```

### 7.2 BC2: Workspace Registry

![T07 — Workspaces](screenshots/08-codedm.jpg)

#### Read — Workspaces (T07)

```typescript
type Input = {};

type Output = {
  workspaces: {
    workspaceId: string;
    path: string;
    badges: WorkspaceBadge[];
    threadCount: number;
    addedAt: string;
  }[];
};

type Errors = never;
```

#### Command — AddWorkspace (C05)

```typescript
type Input = {
  path: string;    // absolute path selected via the native folder picker
};

type Output = {
  workspaceId: string;
  badges: WorkspaceBadge[];
};

type Errors =
  | "PATH_NOT_FOUND"
  | "PATH_NOT_A_DIRECTORY"
  | "WORKSPACE_ALREADY_REGISTERED"
  | "VALIDATION_ERROR";

// Domain Events:
//   WorkspaceAdded { workspaceId, path, badges }
```

#### Command — RemoveWorkspace (C06)

```typescript
type Input = {
  workspaceId: string;
};

type Output = void; // 204 No Content

type Errors =
  | "WORKSPACE_NOT_FOUND"
  | "WORKSPACE_IN_USE";   // an issue with status "WORKING" runs on this workspace

// Domain Events:
//   WorkspaceRemoved { workspaceId, path }
```

### 7.3 BC3: Provider Registry

![T08 — Settings (providers, stop criteria, general)](screenshots/09-codedm.jpg)

#### Read — Settings (T08)

```typescript
type Input = {};

type Output = {
  providers: {
    name: ProviderName;
    status: ProviderStatus;
    binaryPath?: string;
    version?: string;
    isDefault: boolean;
  }[];
  stopCriteria: StopPolicyConfig;                 // owned by BC5, composed into this screen
  general: {
    launchAtLogin: boolean;
    dockBadge: boolean;
    notificationSounds: boolean;
    attachFlowStyle: AttachFlowStyle;
  };
  appVersion: string;
};

type Errors = never;
```

#### Command — RescanProviders (C07)

```typescript
type Input = {};

type Output = {
  providers: {
    name: ProviderName;
    status: ProviderStatus;
    binaryPath?: string;
    version?: string;
  }[];
};

type Errors = never;

// Domain Events:
//   ProvidersRescanned { detected: ProviderName[] }
```

#### Command — SetDefaultProvider (C08)

```typescript
type Input = {
  name: ProviderName;
};

type Output = void; // 204 No Content

type Errors =
  | "PROVIDER_NOT_DETECTED";

// Domain Events:
//   DefaultProviderChanged { name }
```

### 7.4 BC4: Thread & Routing

![T09 — Session Chat](screenshots/10-codedm.jpg)

#### Read — SessionChat (T09)

```typescript
type Input = {
  threadId: string;
};

type Output = {
  thread: ThreadSummary;
  paused: boolean;
  mentionGate: MentionGate;
  autonomyCaption: string;          // "Autonomous — replies send without review" | "Only replies when mentioned with @tag" | "Paused — won't reply until resumed"
  activeStops: Stop[];              // composed from BC5 for the "Needs you" panel
  transcript: TranscriptEntry[];    // includes CONTACT/AGENT/OPERATOR_DIRECT/WHISPER/ACTION entries
  composerMode: "STEER" | "DIRECT"; // STEER while agents live; DIRECT while paused
};

type Errors =
  | "THREAD_NOT_FOUND";
```

![T10 — Thread Settings](screenshots/11-codedm.jpg)

#### Read — ThreadSettings (T10)

```typescript
type Input = {
  threadId: string;
};

type Output = {
  mentionGate: MentionGate;
  participants: Participant[];
  invokerCount: number;
  bufferSize: BufferSize;
};

type Errors =
  | "THREAD_NOT_FOUND";
```

![T15 — Attach Thread Wizard](screenshots/16-codedm.jpg)

#### Read — AttachThreadWizard (T15)

```typescript
type Input = {
  search?: string;    // filters contacts on step 1
};

type Output = {
  style: AttachFlowStyle;
  contacts: {
    contactRef: ContactRef;
    channelKind: ChannelKind;
    alreadyAttached: boolean;
  }[];
  workspaces: {
    workspaceId: string;
    path: string;
    badges: WorkspaceBadge[];
  }[];
  providers: {
    name: ProviderName;
    status: ProviderStatus;
    version?: string;
  }[];
};

type Errors =
  | "NO_CHANNEL_CONNECTED";
```

#### Command — AttachThread (C09)

```typescript
type Input = {
  contactRef: ContactRef;
  workspaceId: string;
  providers: ProviderName[];   // one or more; they share the thread
};

type Output = {
  threadId: string;
};

type Errors =
  | "CHANNEL_NOT_CONNECTED"
  | "WORKSPACE_NOT_FOUND"
  | "PROVIDER_NOT_DETECTED"
  | "NO_PROVIDER_SELECTED"
  | "THREAD_ALREADY_ATTACHED"
  | "VALIDATION_ERROR";

// Domain Events:
//   ThreadAttached { threadId, contactRef, workspaceId, providers }
```

#### Command — PauseThread (C10)

```typescript
type Input = {
  threadId: string;
};

type Output = void; // 204 No Content

type Errors =
  | "THREAD_NOT_FOUND";

// Domain Events:
//   ThreadPaused { threadId }
```

#### Command — ResumeThread (C11)

```typescript
type Input = {
  threadId: string;
};

type Output = void; // 204 No Content

type Errors =
  | "THREAD_NOT_FOUND";

// Domain Events:
//   ThreadResumed { threadId }
```

#### Command — ConfigureMentionGate (C12)

```typescript
type Input = {
  threadId: string;
  mentionGate: MentionGate;   // { enabled: true, tag } requires non-empty tag by construction
};

type Output = void; // 204 No Content

type Errors =
  | "THREAD_NOT_FOUND"
  | "VALIDATION_ERROR";

// Domain Events:
//   MentionGateConfigured { threadId, mentionGate }
```

#### Command — SetParticipantInvocation (C13)

```typescript
type Input = {
  threadId: string;
  participantId: string;
  canInvoke: boolean;
};

type Output = void; // 204 No Content

type Errors =
  | "THREAD_NOT_FOUND"
  | "PARTICIPANT_NOT_FOUND"
  | "LAST_INVOKER";   // at least one participant must keep invocation rights

// Domain Events:
//   ParticipantInvocationChanged { threadId, participantId, canInvoke }
```

#### Command — ConfigureContextBuffer (C14)

```typescript
type Input = {
  threadId: string;
  bufferSize: BufferSize;
};

type Output = void; // 204 No Content

type Errors =
  | "THREAD_NOT_FOUND"
  | "VALIDATION_ERROR";

// Domain Events:
//   ContextBufferConfigured { threadId, bufferSize }
```

#### Command — DetachThread (C15)

```typescript
type Input = {
  threadId: string;
};

type Output = void; // 204 No Content

type Errors =
  | "THREAD_NOT_FOUND";

// Domain Events:
//   IssueArchived { issueId, reason: "THREAD_DETACHED" }  // for each open issue
//   ThreadDetached { threadId }
```

#### Command — IngestChannelMessage (C16)

```typescript
type Input = {
  threadId: string;
  senderExternalId: string;
  text: string;
  quotedEntryId?: string;    // channel-native reply-quote target, when present
  receivedAt: string;
};

type Output = {
  entryId: string;
  invocable: boolean;        // false when paused / sender read-only / gate tag missing
};

type Errors =
  | "THREAD_NOT_FOUND"
  | "VALIDATION_ERROR";

// Domain Events:
//   MessageIngested { threadId, entryId, senderExternalId, invocable }
```

#### Command — ClassifyMessage (C17)

```typescript
type Input = {
  threadId: string;
  entryId: string;
};

type Output = {
  method: ClassificationMethod;
  issueId?: string;          // absent only when method resolution fell through to clarification
};

type Errors =
  | "THREAD_NOT_FOUND"
  | "ENTRY_NOT_FOUND"
  | "ENTRY_NOT_INVOCABLE";

// Domain Events:
//   MessageClassified { threadId, entryId, method, issueId? }
//   IssueOpened { ... }              // via BC5 when method = "NEW_ISSUE"
//   ClarificationRequested { ... }   // via C18 when ambiguous
```

#### Command — RequestClarification (C18)

```typescript
type Input = {
  threadId: string;
  entryId: string;
  question: string;          // e.g. "Is that about the Pix payments or the mobile nav issue?"
  candidateIssueIds: string[];
};

type Output = void; // 201 Created

type Errors =
  | "THREAD_NOT_FOUND"
  | "CLARIFICATION_ALREADY_PENDING";   // max one open clarification per sender

// Domain Events:
//   ClarificationRequested { threadId, entryId, question, candidateIssueIds }
//   OutboundMessageDelivered { senderIdentity: "ROUTER" }   // via BC1
```

#### Command — SteerThread (C19)

```typescript
type Input = {
  threadId: string;
  text: string;
};

type Output = {
  entryId: string;   // WHISPER transcript entry — never delivered to the channel
};

type Errors =
  | "THREAD_NOT_FOUND"
  | "THREAD_PAUSED"        // paused threads use direct mode instead
  | "VALIDATION_ERROR";

// Domain Events:
//   ThreadSteered { threadId, entryId }   // fanned out to every active issue's agent context
```

#### Command — SendDirectMessage (C20)

```typescript
type Input = {
  threadId: string;
  text: string;
};

type Output = {
  entryId: string;   // OPERATOR_DIRECT transcript entry
};

type Errors =
  | "THREAD_NOT_FOUND"
  | "THREAD_NOT_PAUSED"    // direct conversation requires the agents to be paused
  | "CHANNEL_NOT_CONNECTED"
  | "VALIDATION_ERROR";

// Domain Events:
//   DirectMessageSent { threadId, entryId }
//   OutboundMessageDelivered { senderIdentity: "OPERATOR" }   // via BC1
```

### 7.5 BC5: Issue Execution

![T04 — Issues Overview (all threads)](screenshots/05-codedm.jpg)

#### Read — IssuesOverview (T04)

```typescript
type Input = {
  includeArchived: boolean;
};

type Output = {
  statsLine: {
    awaitingInput: number;
    working: number;
    completed: number;
    archived: number;
  };
  groups: {
    status: IssueStatus;
    items: (IssueSummary & {
      threadId: string;
      threadDisplayName: string;
    })[];
  }[];
  archived: (IssueSummary & {
    threadId: string;
    threadDisplayName: string;
  })[];
};

type Errors = never;
```

![T11 — Session Issues (one thread)](screenshots/12-codedm.jpg)

#### Read — SessionIssues (T11)

```typescript
type Input = {
  threadId: string;
};

type Output = {
  statsLine: {
    awaitingInput: number;
    working: number;
    completed: number;
  };
  groups: {
    status: IssueStatus;
    items: IssueSummary[];
  }[];
  archived: IssueSummary[];
  autoArchiveNote: string;   // "Completed issues auto-archive after 24 hours."
};

type Errors =
  | "THREAD_NOT_FOUND";
```

![T12 — Issue Detail](screenshots/13-codedm.jpg)

#### Read — IssueDetail (T12)

```typescript
type Input = {
  issueId: string;
};

type Output = {
  issue: IssueSummary;
  provider: ProviderName;
  terminalLog: TerminalLine[];
  routedMessages: TranscriptEntry[];   // CONTACT/AGENT/WHISPER entries with issueId = this issue
  stops: Stop[];
};

type Errors =
  | "ISSUE_NOT_FOUND";
```

![T14 — Needs You (stops panel, shown on the session)](screenshots/15-codedm.jpg)

#### Read — NeedsYouPanel (T14)

```typescript
type Input = {
  threadId: string;
};

type Output = {
  stops: (Stop & {
    issueId: string;
    issueKey: string;
    availableResolutions: StopResolution[];   // derived from kind
  })[];
};

type Errors =
  | "THREAD_NOT_FOUND";
```

#### Command — OpenIssue (C21)

```typescript
type Input = {
  threadId: string;
  originEntryId: string;    // the classified message that spawned this issue
  title: string;
  provider: ProviderName;
};

type Output = {
  issueId: string;
  key: string;              // generated slug, unique within the thread (e.g. "pix-payment")
};

type Errors =
  | "THREAD_NOT_FOUND"
  | "PROVIDER_NOT_DETECTED"
  | "WORKSPACE_NOT_FOUND"
  | "TERMINAL_SPAWN_FAILED";

// Domain Events:
//   IssueOpened { issueId, threadId, key, title, provider }
```

#### Command — SteerIssue (C22)

```typescript
type Input = {
  issueId: string;
  text: string;
};

type Output = {
  entryId: string;   // WHISPER transcript entry scoped to this issue
};

type Errors =
  | "ISSUE_NOT_FOUND"
  | "ISSUE_ARCHIVED"
  | "VALIDATION_ERROR";

// Domain Events:
//   IssueSteered { issueId, entryId }
//   TerminalOutputAppended { issueId, line: "steer: ..." }
```

#### Command — CompleteIssue (C23)

```typescript
type Input = {
  issueId: string;
  meta?: string;    // e.g. "PR #214"
};

type Output = void; // 204 No Content

type Errors =
  | "ISSUE_NOT_FOUND"
  | "ISSUE_ALREADY_COMPLETED";

// Domain Events:
//   IssueCompleted { issueId, threadId, key, completedAt }
```

#### Command — RaiseStop (C24)

```typescript
type Input = {
  issueId: string;
  kind: StopKind;
  title: string;
  detail: string;
};

type Output = {
  stopId: string;
};

type Errors =
  | "ISSUE_NOT_FOUND"
  | "ISSUE_ARCHIVED"
  | "STOP_CRITERION_DISABLED";   // the kind is toggled off in StopPolicyConfig

// Domain Events:
//   StopRaised { stopId, issueId, threadId, kind }
```

#### Command — ResolveStop (C25)

```typescript
type Input = {
  stopId: string;
  resolution: StopResolution;
};

type Output = void; // 204 No Content

type Errors =
  | "STOP_NOT_FOUND"
  | "RESOLUTION_NOT_APPLICABLE";  // e.g. "APPROVE" on a "SERVER_ERROR" stop

// Domain Events:
//   StopResolved { stopId, issueId, resolution }
//   ThreadPaused { threadId }     // additionally, when resolution = "TAKE_OVER"
```

#### Command — ArchiveIssue (C26)

```typescript
type Input = {
  issueId: string;
};

type Output = void; // 204 No Content

type Errors =
  | "ISSUE_NOT_FOUND"
  | "ISSUE_ALREADY_ARCHIVED";

// Domain Events:
//   IssueArchived { issueId, reason: "MANUAL" }
```

#### Command — RestoreIssue (C27)

```typescript
type Input = {
  issueId: string;
};

type Output = void; // 204 No Content

type Errors =
  | "ISSUE_NOT_FOUND"
  | "ISSUE_NOT_ARCHIVED";

// Domain Events:
//   IssueRestored { issueId }
```

#### Command — AutoArchiveCompletedIssues (C28)

```typescript
type Input = {};   // scheduler tick

type Output = {
  archivedIssueIds: string[];   // "COMPLETED" issues with completedAt <= now - 24 h
};

type Errors = never;

// Domain Events:
//   IssueArchived { issueId, reason: "AUTO_24H" }   // one per archived issue
```

#### Command — UpdateStopCriteriaConfig (C29)

```typescript
type Input = {
  stopCriteria: StopPolicyConfig;
};

type Output = void; // 204 No Content

type Errors =
  | "VALIDATION_ERROR";

// Domain Events:
//   StopCriteriaConfigUpdated { stopCriteria }
```

### 7.6 BC6: Artifact Registry

![T13 — Artifacts](screenshots/14-codedm.jpg)

#### Read — Artifacts (T13)

```typescript
type Input = {
  threadId: string;
};

type Output = {
  artifacts: {
    artifactId: string;
    issueId?: string;
    kind: ArtifactKind;
    name: string;          // e.g. "acme-pr-214.vercel.app", "checkout-mobile-before-after.png"
    meta: string;          // e.g. "Preview deploy · 2 min ago", "Screenshot · 640 KB"
    recordedAt: string;
  }[];
};

type Errors =
  | "THREAD_NOT_FOUND";
```

#### Command — RecordArtifact (C30)

```typescript
type Input = {
  threadId: string;
  issueId?: string;
  kind: ArtifactKind;
  name: string;
  ref: string;    // local path (IMAGE/FILE) or URL (LINK)
  meta: string;
};

type Output = {
  artifactId: string;
};

type Errors =
  | "THREAD_NOT_FOUND"
  | "ISSUE_NOT_FOUND"
  | "VALIDATION_ERROR";

// Domain Events:
//   ArtifactRecorded { artifactId, threadId, issueId?, kind, name }
```

### 7.7 Cross-Context Reads — Operator Console

These reads compose data from several bounded contexts; they own no aggregates.

![T01 — Onboarding (slide 1)](screenshots/01-codedm.jpg)
![T01 — Onboarding (slide 2)](screenshots/02-codedm.jpg)

#### Read — Onboarding (T01)

```typescript
type Input = {};

type Output = {
  slides: {
    heading: string;       // "DM YOUR CODEBASE" | "HOW IT WORKS" | "YOU STAY IN CONTROL"
    body: string;
  }[];
  currentSlide: number;
};

type Errors = never;
```

![T02 — Setup Checklist (first-run Home)](screenshots/03-codedm.jpg)

#### Read — SetupChecklist (T02)

```typescript
type Input = {};

type Output = {
  steps: {
    label: "CONNECT_A_CHANNEL" | "ADD_A_WORKSPACE" | "ATTACH_YOUR_FIRST_THREAD";
    done: boolean;
  }[];
  complete: boolean;   // true once at least one thread exists — Home switches to T03
};

type Errors = never;
```

![T03 — Home Dashboard](screenshots/04-codedm.jpg)

#### Read — HomeDashboard (T03)

```typescript
type Input = {};

type Output = {
  agentsRunningNow: number;
  needsYou?: {
    threadId: string;
    threadDisplayName: string;
    stopKinds: StopKind[];
  };
  activeSessions: ThreadSummary[];
  latestActivity: {
    title: string;
    subtitle: string;
    threadId: string;
    at: string;
  }[];
  today: {
    issuesOpened: number;
    issuesClosed: number;
    medianResponseSeconds: number;
  };
  channels: {
    kind: ChannelKind;
    status: ChannelStatus;
  }[];
};

type Errors = never;
```

### 7.8 Integration Events Summary

```typescript
// ┌──────────────────┐  InboundMessageReceived   ┌─────────────────────┐
// │ BC1: Gateway     │ ─────────────────────────►│ BC4: Thread&Routing │
// │                  │ ◄─────────────────────────│                     │
// └──────────────────┘  DeliverOutboundMessage   └──────────┬──────────┘
//        ▲                (labeled replies,                 │ OpenIssue /
//        │                clarifications,                   │ RouteMessage / Steer
//        │                direct messages)                  ▼
//        │                                       ┌─────────────────────┐
//        │  AgentReplyDrafted (labeled)          │ BC5: Issue          │
//        └───────────────────────────────────────│ Execution           │
//                                                └───┬──────────┬──────┘
//     StopRaised / StopResolved / IssueCompleted     │          │ ArtifactRecorded
//     ────────────────────────────────► BC4 status   │          ▼
//                                                    │   ┌──────────────┐
//     WorkspaceAdded/Removed (BC2) ──► BC4/BC5 refs  │   │ BC6:         │
//     ProvidersRescanned (BC3)     ──► BC4/BC5 refs  ◄───│ Artifacts    │
//                                                        └──────────────┘
```

| Event | Producer | Consumers | Purpose |
|---|---|---|---|
| InboundMessageReceived | BC1 | BC4 | feed ingestion/classification |
| OutboundMessageDelivered | BC1 | BC4 | transcript confirmation |
| ThreadAttached | BC4 | BC5 | warm up workspace indexing |
| MessageClassified | BC4 | BC5 | route message into issue context |
| ThreadSteered | BC4 | BC5 | fan whisper into active issues |
| IssueOpened / IssueCompleted | BC5 | BC4 | transcript action lines, status, metrics |
| AgentReplyDrafted | BC5 | BC4 → BC1 | labeled delivery to channel |
| StopRaised / StopResolved | BC5 | BC4 | NEEDS_ATTENTION status, Home callout, dock badge |
| IssueArchived / IssueRestored | BC5 | BC4 | issue list projections |
| ArtifactRecorded | BC5 | BC6 | artifact catalog |
| WorkspaceRemoved | BC2 | BC4, BC5 | invalidate references |
| ChannelDisconnected | BC1 | BC4 | park affected threads |

### 7.9 Error Codes Glossary

```typescript
type GlobalErrors = "VALIDATION_ERROR";

type ChannelGatewayErrors =
  | "CHANNEL_NOT_FOUND"
  | "CHANNEL_ALREADY_CONNECTED"
  | "CHANNEL_NOT_CONNECTED"
  | "PAIRING_ALREADY_IN_PROGRESS"
  | "PAIRING_TOKEN_EXPIRED"
  | "PAIRING_NOT_IN_PROGRESS"
  | "DELIVERY_FAILED";

type WorkspaceRegistryErrors =
  | "PATH_NOT_FOUND"
  | "PATH_NOT_A_DIRECTORY"
  | "WORKSPACE_ALREADY_REGISTERED"
  | "WORKSPACE_NOT_FOUND"
  | "WORKSPACE_IN_USE";

type ProviderRegistryErrors =
  | "PROVIDER_NOT_DETECTED";

type ThreadRoutingErrors =
  | "THREAD_NOT_FOUND"
  | "THREAD_ALREADY_ATTACHED"
  | "THREAD_PAUSED"
  | "THREAD_NOT_PAUSED"
  | "NO_PROVIDER_SELECTED"
  | "NO_CHANNEL_CONNECTED"
  | "PARTICIPANT_NOT_FOUND"
  | "LAST_INVOKER"
  | "ENTRY_NOT_FOUND"
  | "ENTRY_NOT_INVOCABLE"
  | "CLARIFICATION_ALREADY_PENDING";

type IssueExecutionErrors =
  | "ISSUE_NOT_FOUND"
  | "ISSUE_ARCHIVED"
  | "ISSUE_NOT_ARCHIVED"
  | "ISSUE_ALREADY_ARCHIVED"
  | "ISSUE_ALREADY_COMPLETED"
  | "TERMINAL_SPAWN_FAILED"
  | "STOP_CRITERION_DISABLED"
  | "STOP_NOT_FOUND"
  | "RESOLUTION_NOT_APPLICABLE";
```
