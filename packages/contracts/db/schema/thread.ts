import { pgSchema, uuid, text, timestamp, integer, boolean, jsonb, index, uniqueIndex } from 'drizzle-orm/pg-core'
// Enum column types — single-sourced from the generated wire binding (type-only, erased at compile).
import type {
	ProviderKind,
	ContactKind,
	ThreadStatus,
	BufferSize,
	TranscriptKind,
	ClassificationMethod,
} from '../../generated/typescript/src/wire/enums'

/**
 * `thread` — BC4 Thread & Routing (Core, TS-owned). The binding of a conversation to a workspace +
 * providers, its control plane (pause / mention gate / participants / buffer), the transcript, and
 * the router's pending clarifications.
 *
 * Tables:
 *   - `threads` — the Thread aggregate. The ContactRef VO is flattened to `contact_*`; the
 *     MentionGate discriminated-union VO is flattened to `mention_gate_enabled` (+ `mention_gate_tag`
 *     present iff enabled); `participants` (a small per-thread VO list with per-item invocation)
 *     is embedded as jsonb — the aggregate loads/saves it as a unit; `providers` is a text[] of the
 *     ProviderKind wire enum; `buffer_size` is the BufferSize wire enum (string tiers) as text.
 *   - `transcript_entries` — the TranscriptEntry entity (the conversation + audit log). Queried per
 *     thread (T09) and per issue (T12); a distinct entity, not an embedded VO.
 *   - `thread_clarifications` — the router's pending-clarification record (Router is a Service, not
 *     an aggregate). At most one OPEN clarification per sender (invariant enforced by the Service).
 */
export const threadSchema = pgSchema('thread')

// Participant VO (embedded on the Thread aggregate). Reassembled as a Value Object in the domain.
type ThreadParticipant = {
	participantId: string
	name: string
	source: string
	canInvoke: boolean
}

export const threads = threadSchema.table(
	'threads',
	{
		id: uuid('id').primaryKey().defaultRandom(),

		ownerId: uuid('owner_id').notNull(),

		// The connected channel this thread rides on (channel-side is Go-owned; opaque id here).
		channelId: uuid('channel_id').notNull(),

		// ContactRef VO (flattened): the channel counterparty. contact_external_id is the
		// channel-native id (phone / handle / group id).
		contactExternalId: text('contact_external_id').notNull(),
		contactDisplayName: text('contact_display_name').notNull(),
		contactKind: text('contact_kind').$type<ContactKind>().notNull(),

		// The bound workspace (BC2) and providers (BC3). providers is non-empty (aggregate invariant).
		workspaceId: uuid('workspace_id').notNull(),
		providers: text('providers').array().$type<ProviderKind[]>().notNull(),

		// Control plane.
		paused: boolean('paused').notNull().default(false),
		// MentionGate discriminated-union VO (flattened): tag is present exactly when enabled.
		mentionGateEnabled: boolean('mention_gate_enabled').notNull().default(false),
		mentionGateTag: text('mention_gate_tag'),
		participants: jsonb('participants').$type<ThreadParticipant[]>().notNull(),
		bufferSize: text('buffer_size').$type<BufferSize>().notNull(),

		// Aggregate operating status, derived from issues + pause state.
		status: text('status').$type<ThreadStatus>().notNull(),

		createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
		updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
		version: integer('version').notNull().default(1),
	},
	t => ({
		ownerIdx: index('threads_owner_id_idx').on(t.ownerId),
		// One thread per contact per channel (attach dedupe).
		ownerChannelContactUnq: uniqueIndex('threads_owner_channel_contact_unq').on(
			t.ownerId,
			t.channelId,
			t.contactExternalId,
		),
		workspaceIdx: index('threads_workspace_id_idx').on(t.workspaceId),
	}),
)

export const transcriptEntries = threadSchema.table(
	'transcript_entries',
	{
		id: uuid('id').primaryKey().defaultRandom(),

		ownerId: uuid('owner_id').notNull(),
		threadId: uuid('thread_id').notNull(),

		// CONTACT / AGENT / OPERATOR_DIRECT / WHISPER / ACTION.
		kind: text('kind').$type<TranscriptKind>().notNull(),
		text: text('text').notNull(),

		// Present when routed to an issue.
		issueId: uuid('issue_id'),
		// Present for channel reply-quotes.
		quotedEntryId: uuid('quoted_entry_id'),
		// Present for inbound CONTACT entries.
		senderExternalId: text('sender_external_id'),
		// Present for kind AGENT.
		provider: text('provider').$type<ProviderKind>(),
		// Present on ACTION lines produced by the router.
		classification: text('classification').$type<ClassificationMethod>(),

		// When the entry occurred (channel timestamp or system time).
		at: timestamp('at', { withTimezone: true }).notNull(),
		createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
	},
	t => ({
		threadAtIdx: index('transcript_entries_thread_at_idx').on(t.threadId, t.at),
		issueIdx: index('transcript_entries_issue_id_idx').on(t.issueId),
	}),
)

export const threadClarifications = threadSchema.table(
	'thread_clarifications',
	{
		id: uuid('id').primaryKey().defaultRandom(),

		ownerId: uuid('owner_id').notNull(),
		threadId: uuid('thread_id').notNull(),

		// The inbound entry that triggered the clarification.
		entryId: uuid('entry_id').notNull(),
		// Whose message was ambiguous — the "one open clarification per sender" key.
		senderExternalId: text('sender_external_id').notNull(),
		question: text('question').notNull(),
		// Candidate issues the reply-quote will disambiguate between.
		candidateIssueIds: jsonb('candidate_issue_ids').$type<string[]>().notNull(),

		askedAt: timestamp('asked_at', { withTimezone: true }).notNull().defaultNow(),
		// Null while open; stamped when the next reply-quote resolves routing.
		resolvedAt: timestamp('resolved_at', { withTimezone: true }),
	},
	t => ({
		// Supports the "max one OPEN clarification per (thread, sender)" lookup (Service invariant).
		threadSenderIdx: index('thread_clarifications_thread_sender_idx').on(t.threadId, t.senderExternalId),
	}),
)
