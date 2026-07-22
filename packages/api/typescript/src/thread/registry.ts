// Per-env DI bindings for the thread (BC4 Thread & Routing) context.
import './errors' // Side-effect: registers this context's error codes with the framework runtime registry.

import { type InstanceRegistry, expandBindings } from '@codedm/core-typescript'
import { ThreadRepository, DrizzleThreadRepository, MockThreadRepository } from './repositories/ThreadRepository'
import {
	ConsumedMessageRepository,
	DrizzleConsumedMessageRepository,
	MockConsumedMessageRepository,
} from './repositories/ConsumedMessageRepository'
import { TranscriptRepository, DrizzleTranscriptRepository, MockTranscriptRepository } from './repositories/TranscriptRepository'
import { ClarificationRepository, DrizzleClarificationRepository, MockClarificationRepository } from './repositories/ClarificationRepository'
import { OpenIssuesReader, DrizzleOpenIssuesReader, MockOpenIssuesReader } from './services/OpenIssuesReader'
import { ChannelConnectivity, DrizzleChannelConnectivity, MockChannelConnectivity } from './services/ChannelConnectivity'
import { GroupMemberReader, DrizzleGroupMemberReader, MockGroupMemberReader } from './services/GroupMemberReader'

export const INSTANCE_REGISTRY: InstanceRegistry = expandBindings([
	{ token: ThreadRepository, mock: MockThreadRepository, real: DrizzleThreadRepository },
	// The exactly-once inbound ledger — real (unique-constraint ON CONFLICT DO NOTHING) in real +
	// integration so the dedup is exercised against a real DB; in-memory set in mock.
	{
		token: ConsumedMessageRepository,
		mock: MockConsumedMessageRepository,
		integration: DrizzleConsumedMessageRepository,
		real: DrizzleConsumedMessageRepository,
	},
	{ token: TranscriptRepository, mock: MockTranscriptRepository, real: DrizzleTranscriptRepository },
	{ token: ClarificationRepository, mock: MockClarificationRepository, real: DrizzleClarificationRepository },
	// Classifier candidate set + reply-quote resolution: real table reads in real+integration, empty in mock.
	{ token: OpenIssuesReader, mock: MockOpenIssuesReader, integration: DrizzleOpenIssuesReader, real: DrizzleOpenIssuesReader },
	// Channel-connected gate reads the Go gateway read model: real in real+integration, always-true in mock.
	{ token: ChannelConnectivity, mock: MockChannelConnectivity, integration: DrizzleChannelConnectivity, real: DrizzleChannelConnectivity },
	// Group-member hydration reads the Go gateway `remote_memberships` read model: real in
	// real+integration, empty in mock.
	{ token: GroupMemberReader, mock: MockGroupMemberReader, integration: DrizzleGroupMemberReader, real: DrizzleGroupMemberReader },
])
