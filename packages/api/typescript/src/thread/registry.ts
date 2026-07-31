// Per-env DI bindings for the thread (BC4 Thread & Routing) context.
import './errors' // Side-effect: registers this context's error codes with the framework runtime registry.

import { type InstanceRegistry, expandBindings } from '@codm/core-typescript'
import { ChannelSender, GatewayChannelSender, MockChannelSender } from './services/ChannelSender'

/** The Playwright harness boots the real daemon with no gateway behind it — see the ChannelSender binding. */
const E2E = process.env.CODM_E2E === 'true'
import { ThreadRepository, DrizzleThreadRepository, MockThreadRepository } from './repositories/ThreadRepository'
import {
	ConsumedMessageRepository,
	DrizzleConsumedMessageRepository,
	MockConsumedMessageRepository,
} from './repositories/ConsumedMessageRepository'
import {
	StopPolicyConfigRepository,
	DrizzleStopPolicyConfigRepository,
	MockStopPolicyConfigRepository,
} from './repositories/StopPolicyConfigRepository'
import { OpenIssuesReader, DrizzleOpenIssuesReader, MockOpenIssuesReader } from './services/OpenIssuesReader'
import { ChannelConnectivity, DrizzleChannelConnectivity, MockChannelConnectivity } from './services/ChannelConnectivity'
import { GroupMemberReader, DrizzleGroupMemberReader, MockGroupMemberReader } from './services/GroupMemberReader'
import { ThreadStatusDeriver, DrizzleThreadStatusDeriver, MockThreadStatusDeriver } from './services/ThreadStatusDeriver'
import { ReplyStreamer } from './services/ReplyStreamer'

export const INSTANCE_REGISTRY: InstanceRegistry = expandBindings([
	// The one seam in this context that opens a socket (BC4 → BC1 WRITE, over the gateway's own SDK —
	// S2S, permitted between services). Bound to the double outside `real` so no test depends on the
	// Go gateway being up, which is the operational half of the S2S rule.
	// Hermetic under CODM_E2E, same rule the agent registry uses for its runner: the Playwright
	// harness boots the REAL daemon but there is no Go gateway behind it, so a real send fails with
	// GATEWAY_UNAVAILABLE.
	//
	// That failure is not confined to the send. The outbox is ORDERED PER OWNER and skips everything
	// behind a failed predecessor, so one dead delivery took `agent.issue_forked` down with it —
	// "skipped: predecessor failed" — and the issue never materialized. The pivot is what surfaced it:
	// the orchestrator now replies on EVERY turn, so `agent.orchestrator_replied` is emitted before
	// the fork instead of after an issue already existed.
	{ token: ChannelSender, mock: MockChannelSender, integration: MockChannelSender, real: E2E ? MockChannelSender : GatewayChannelSender },
	{ token: ThreadRepository, mock: MockThreadRepository, real: DrizzleThreadRepository },
	// The per-owner stop-criteria toggles — a settings row that follows the aggregate raising the stops
	// it gates (B4, spec decision 4). It was bound in `issue/` while the Stop hung off `Issue`.
	{ token: StopPolicyConfigRepository, mock: MockStopPolicyConfigRepository, real: DrizzleStopPolicyConfigRepository },
	// The exactly-once inbound ledger — real (unique-constraint ON CONFLICT DO NOTHING) in real +
	// integration so the dedup is exercised against a real DB; in-memory set in mock.
	{
		token: ConsumedMessageRepository,
		mock: MockConsumedMessageRepository,
		integration: DrizzleConsumedMessageRepository,
		real: DrizzleConsumedMessageRepository,
	},
	// Classifier candidate set + reply-quote resolution: real table reads in real+integration, empty in mock.
	{ token: OpenIssuesReader, mock: MockOpenIssuesReader, integration: DrizzleOpenIssuesReader, real: DrizzleOpenIssuesReader },
	// Channel-connected gate reads the Go gateway read model: real in real+integration, always-true in mock.
	{ token: ChannelConnectivity, mock: MockChannelConnectivity, integration: DrizzleChannelConnectivity, real: DrizzleChannelConnectivity },
	// Group-member hydration reads the Go gateway `remote_memberships` read model: real in
	// real+integration, empty in mock.
	{ token: GroupMemberReader, mock: MockGroupMemberReader, integration: DrizzleGroupMemberReader, real: DrizzleGroupMemberReader },
	// Derived thread status: real table reads in real+integration, IDLE in mock. The seam exists because
	// the three READS behind the precedence were duplicated at every call site (spec decision 7).
	{ token: ThreadStatusDeriver, mock: MockThreadStatusDeriver, integration: DrizzleThreadStatusDeriver, real: DrizzleThreadStatusDeriver },
	// The streamed reply's in-flight state (streaming spec). SAME class in all three envs, and a
	// SINGLETON by the class-binding rule — which is the whole point: the turn that enqueues the cuts,
	// the executor that applies them and the delivery that finishes them must see ONE map, or the
	// sequence guard is guarding three separate memories and the final edit cannot find the message it
	// is supposed to complete. Process-local by design; see the class doc for why durability buys
	// nothing here.
	{ token: ReplyStreamer, mock: ReplyStreamer, integration: ReplyStreamer, real: ReplyStreamer },
])
