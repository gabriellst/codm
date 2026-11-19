// Per-env DI bindings for the thread (BC4 Thread & Routing) context.
import './errors' // Side-effect: registers this context's error codes with the framework runtime registry.

import { type InstanceRegistry, expandBindings } from '@codm/core-typescript'
import { ChannelSender, GatewayChannelSender, MockChannelSender } from './services/ChannelSender'
import { ThreadRepository, LibSqlThreadRepository, MockThreadRepository } from './repositories/ThreadRepository'
import { LoopRepository, LibSqlLoopRepository, MockLoopRepository } from './repositories/LoopRepository'
import {
	ConsumedMessageRepository,
	LibSqlConsumedMessageRepository,
	MockConsumedMessageRepository,
} from './repositories/ConsumedMessageRepository'
import { PanelActionLedger, LibSqlPanelActionLedger, MockPanelActionLedger } from './repositories/PanelActionLedger'
import {
	StopPolicyConfigRepository,
	LibSqlStopPolicyConfigRepository,
	MockStopPolicyConfigRepository,
} from './repositories/StopPolicyConfigRepository'
import { OpenIssuesReader, LibSqlOpenIssuesReader, MockOpenIssuesReader } from './services/OpenIssuesReader'
import { IssueArtifactReader, LibSqlIssueArtifactReader, MockIssueArtifactReader } from './services/IssueArtifactReader'
import { ChannelConnectivity, LibSqlChannelConnectivity, MockChannelConnectivity } from './services/ChannelConnectivity'
import { GroupMemberReader, LibSqlGroupMemberReader, MockGroupMemberReader } from './services/GroupMemberReader'
import { ThreadStatusDeriver, LibSqlThreadStatusDeriver, MockThreadStatusDeriver } from './services/ThreadStatusDeriver'
import { ReplyStreamer } from './services/ReplyStreamer'
import { PanelRosterRelay, CloudPanelRosterRelay, MockPanelRosterRelay } from './services/PanelRosterRelay'
import { PanelMemberKey, FilePanelMemberKey, MockPanelMemberKey } from './services/PanelMemberKey'
import { InboundTriageQueue } from './services/InboundTriageQueue'
import { BatchRepository, LibSqlBatchRepository, MockBatchRepository } from './repositories/BatchRepository'
import { BatchSequence, LibSqlBatchSequence, MockBatchSequence } from './services/BatchSequence'

export const INSTANCE_REGISTRY: InstanceRegistry = expandBindings([
	// The one seam in this context that opens a socket (BC4 → BC1 WRITE, over the gateway's own SDK —
	// S2S, permitted between services). Bound to the double outside `real` so no test depends on the
	// Go gateway being up, which is the operational half of the S2S rule.
	// Hermetic under `e2e` too, same rule the agent registry uses for its runner: the Playwright
	// harness boots the REAL daemon but there is no Go gateway behind it, so a real send fails with
	// GATEWAY_UNAVAILABLE. No explicit `e2e` column needed (T5) — OMITTED mirrors `integration`, which
	// is already the mock, so the fallback chain (`expandBindings`) reproduces the exact swap the old
	// old raw-flag ternary did on `real`, without redeclaring an identical value.
	//
	// That failure is not confined to the send. The outbox is ORDERED PER OWNER and skips everything
	// behind a failed predecessor, so one dead delivery took `agent.issue_forked` down with it —
	// "skipped: predecessor failed" — and the issue never materialized. The pivot is what surfaced it:
	// the orchestrator now replies on EVERY turn, so `agent.orchestrator_replied` is emitted before
	// the fork instead of after an issue already existed.
	{ token: ChannelSender, mock: MockChannelSender, integration: MockChannelSender, real: GatewayChannelSender },
	{ token: ThreadRepository, mock: MockThreadRepository, real: LibSqlThreadRepository },
	// The scheduled whispers of a conversation. Real in real+integration (the due-sweep's whole
	// behaviour is a `next_run_at <= now` query against an index, so it must be exercised against a
	// real database); an in-memory map in mock, where `findDue` reuses `Loop.isDue` so the double
	// cannot disagree with the SQL about what "due" means.
	{ token: LoopRepository, mock: MockLoopRepository, real: LibSqlLoopRepository },
	// The per-owner stop-criteria toggles — a settings row that follows the aggregate raising the stops
	// it gates (B4, spec decision 4). It was bound in `issue/` while the Stop hung off `Issue`.
	{ token: StopPolicyConfigRepository, mock: MockStopPolicyConfigRepository, real: LibSqlStopPolicyConfigRepository },
	// The exactly-once inbound ledger — real (unique-constraint ON CONFLICT DO NOTHING) in real +
	// integration so the dedup is exercised against a real DB; in-memory set in mock.
	{
		token: ConsumedMessageRepository,
		mock: MockConsumedMessageRepository,
		integration: LibSqlConsumedMessageRepository,
		real: LibSqlConsumedMessageRepository,
	},
	// Classifier candidate set + reply-quote resolution: real table reads in real+integration, empty in mock.
	{ token: OpenIssuesReader, mock: MockOpenIssuesReader, integration: LibSqlOpenIssuesReader, real: LibSqlOpenIssuesReader },
	// The artifact a FEEDBACK previews (fase 3, item 2) — the declared `reads.artifact` table read in real+integration.
	{ token: IssueArtifactReader, mock: MockIssueArtifactReader, integration: LibSqlIssueArtifactReader, real: LibSqlIssueArtifactReader },
	// Channel-connected gate reads the Go gateway read model: real in real+integration, always-true in mock.
	{ token: ChannelConnectivity, mock: MockChannelConnectivity, integration: LibSqlChannelConnectivity, real: LibSqlChannelConnectivity },
	// Group-member hydration reads the Go gateway `remote_memberships` read model: real in
	// real+integration, empty in mock.
	{ token: GroupMemberReader, mock: MockGroupMemberReader, integration: LibSqlGroupMemberReader, real: LibSqlGroupMemberReader },
	// Derived thread status: real table reads in real+integration, IDLE in mock. The seam exists because
	// the three READS behind the precedence were duplicated at every call site (spec decision 7).
	{ token: ThreadStatusDeriver, mock: MockThreadStatusDeriver, integration: LibSqlThreadStatusDeriver, real: LibSqlThreadStatusDeriver },
	// The streamed reply's in-flight state (streaming spec). SAME class in all three envs, and a
	// SINGLETON by the class-binding rule — which is the whole point: the turn that enqueues the cuts,
	// the executor that applies them and the delivery that finishes them must see ONE map, or the
	// sequence guard is guarding three separate memories and the final edit cannot find the message it
	// is supposed to complete. Process-local by design; see the class doc for why durability buys
	// nothing here.
	{ token: ReplyStreamer, mock: ReplyStreamer, integration: ReplyStreamer, real: ReplyStreamer },
	// Fase 2, item 6a — the people-side pull from the cloud panel (roster out, identification codes in).
	// Opens a socket to the cloud, so only `real` binds the cloud client (S2S rule, same as PanelPublisher);
	// the member-id key is a file under the data dir, so tests use a fixed in-memory key.
	{ token: PanelRosterRelay, mock: MockPanelRosterRelay, integration: MockPanelRosterRelay, real: CloudPanelRosterRelay },
	{ token: PanelMemberKey, mock: MockPanelMemberKey, integration: MockPanelMemberKey, real: FilePanelMemberKey },
	// Fase 2, item 6b — the exactly-once latch + outcome outbox of panel actions. Real (primary-key ON
	// CONFLICT DO NOTHING) in real + integration so the dedup is exercised against a real DB.
	{ token: PanelActionLedger, mock: MockPanelActionLedger, integration: LibSqlPanelActionLedger, real: LibSqlPanelActionLedger },
	// The parallel triage's bounded pool (fase 2). A SINGLETON by the class-binding rule, and that is the
	// point: the bound on concurrent triages only holds if every submit reaches the same pool. Same class in
	// every env — whether anything is triaged is `InboundTriage`'s binding (agent registry), not this one's.
	{ token: InboundTriageQueue, mock: InboundTriageQueue, integration: InboundTriageQueue, real: InboundTriageQueue },
	// Fase 4, item 5 — the batch aggregate and its per-conversation number. Real in real + integration: the timeline
	// reads the item rows this repository writes (`issue_id`, `recorded_at`), so the write is exercised for real.
	{ token: BatchRepository, mock: MockBatchRepository, real: LibSqlBatchRepository },
	{ token: BatchSequence, mock: MockBatchSequence, real: LibSqlBatchSequence },
])
