import { sqliteTable, text, integer, index, uniqueIndex } from 'drizzle-orm/sqlite-core'
import {
	ProviderKind,
	ContactKind,
	ThreadStatus,
	BufferSize,
	TranscriptKind,
	ClassificationMethod,
} from '../../generated/typescript/src/wire/enums'
import { enumCheck } from './_enum'

/**
 * `thread` (pgSchema namespace) → `thread_*` table prefix. SQLite-dialect mirror of
 * db/schema/thread.ts. Thread aggregate (flattened ContactRef / MentionGate VOs,
 * embedded participants + providers), the transcript, the exactly-once inbound
 * ledger, and the router's pending clarifications. pg `text[]` (providers) and pg
 * jsonb (participants, candidate_issue_ids) → sqlite `text { mode: 'json' }`.
 */

type ThreadParticipant = {
	participantId: string
	name: string
	source: string
	canInvoke: boolean
}

export const threads = sqliteTable(
	'thread_threads',
	{
		id: text('id').primaryKey(),

		ownerId: text('owner_id').notNull(),
		channelId: text('channel_id').notNull(),

		// ContactRef VO (flattened).
		contactExternalId: text('contact_external_id').notNull(),
		contactDisplayName: text('contact_display_name').notNull(),
		contactKind: text('contact_kind').$type<ContactKind>().notNull(),

		workspaceId: text('workspace_id').notNull(),
		// pg text[] (ProviderKind[]) → sqlite json.
		providers: text('providers', { mode: 'json' }).$type<ProviderKind[]>().notNull(),

		paused: integer('paused', { mode: 'boolean' }).notNull().default(false),
		// MentionGate discriminated-union VO (flattened): tag present iff enabled.
		mentionGateEnabled: integer('mention_gate_enabled', { mode: 'boolean' }).notNull().default(false),
		mentionGateTag: text('mention_gate_tag'),
		participants: text('participants', { mode: 'json' }).$type<ThreadParticipant[]>().notNull(),
		// BufferSize string tiers (25 | 50 | 100 | 200).
		bufferSize: text('buffer_size').$type<BufferSize>().notNull(),

		// ThreadStatus (RUNNING | IDLE | NEEDS_ATTENTION | PAUSED).
		status: text('status').$type<ThreadStatus>().notNull(),

		createdAt: integer('created_at', { mode: 'timestamp_ms' })
			.notNull()
			.$defaultFn(() => new Date()),
		updatedAt: integer('updated_at', { mode: 'timestamp_ms' })
			.notNull()
			.$defaultFn(() => new Date()),
		version: integer('version').notNull().default(1),
	},
	t => [
		enumCheck('thread_threads_contact_kind_check', t.contactKind, Object.values(ContactKind)),
		enumCheck('thread_threads_buffer_size_check', t.bufferSize, Object.values(BufferSize)),
		enumCheck('thread_threads_status_check', t.status, Object.values(ThreadStatus)),
		index('threads_owner_id_idx').on(t.ownerId),
		uniqueIndex('threads_owner_channel_contact_unq').on(t.ownerId, t.channelId, t.contactExternalId),
		index('threads_workspace_id_idx').on(t.workspaceId),
	],
)

export const transcriptEntries = sqliteTable(
	'thread_transcript_entries',
	{
		id: text('id').primaryKey(),

		ownerId: text('owner_id').notNull(),
		threadId: text('thread_id').notNull(),

		// TranscriptKind (CONTACT | SYSTEM | DIRECT | WHISPER | ACTION).
		kind: text('kind').$type<TranscriptKind>().notNull(),
		text: text('text').notNull(),

		issueId: text('issue_id'),
		quotedEntryId: text('quoted_entry_id'),
		senderExternalId: text('sender_external_id'),
		// ProviderKind — present for kind AGENT.
		provider: text('provider').$type<ProviderKind>(),
		// ClassificationMethod — present on ACTION lines.
		classification: text('classification').$type<ClassificationMethod>(),

		at: integer('at', { mode: 'timestamp_ms' }).notNull(),
		createdAt: integer('created_at', { mode: 'timestamp_ms' })
			.notNull()
			.$defaultFn(() => new Date()),
	},
	t => [
		enumCheck('thread_transcript_entries_kind_check', t.kind, Object.values(TranscriptKind)),
		enumCheck('thread_transcript_entries_provider_check', t.provider, Object.values(ProviderKind)),
		enumCheck('thread_transcript_entries_classification_check', t.classification, Object.values(ClassificationMethod)),
		index('transcript_entries_thread_at_idx').on(t.threadId, t.at),
		index('transcript_entries_issue_id_idx').on(t.issueId),
	],
)

/**
 * `consumed_messages` — the BC4 inbound-message idempotency ledger. `INSERT ... ON
 * CONFLICT DO NOTHING` keyed on UNIQUE(channel_id, platform_message_id) turns
 * at-least-once delivery into exactly-once processing.
 */
export const consumedMessages = sqliteTable(
	'thread_consumed_messages',
	{
		id: text('id').primaryKey(),

		ownerId: text('owner_id').notNull(),

		channelId: text('channel_id').notNull(),
		platformMessageId: text('platform_message_id').notNull(),

		threadId: text('thread_id'),
		entryId: text('entry_id'),

		consumedAt: integer('consumed_at', { mode: 'timestamp_ms' })
			.notNull()
			.$defaultFn(() => new Date()),
	},
	t => [uniqueIndex('consumed_messages_channel_message_unq').on(t.channelId, t.platformMessageId)],
)

export const threadClarifications = sqliteTable(
	'thread_thread_clarifications',
	{
		id: text('id').primaryKey(),

		ownerId: text('owner_id').notNull(),
		threadId: text('thread_id').notNull(),

		entryId: text('entry_id').notNull(),
		senderExternalId: text('sender_external_id').notNull(),
		question: text('question').notNull(),
		// pg jsonb (string[]) → sqlite json.
		candidateIssueIds: text('candidate_issue_ids', { mode: 'json' }).$type<string[]>().notNull(),

		askedAt: integer('asked_at', { mode: 'timestamp_ms' })
			.notNull()
			.$defaultFn(() => new Date()),
		resolvedAt: integer('resolved_at', { mode: 'timestamp_ms' }),
	},
	t => [index('thread_clarifications_thread_sender_idx').on(t.threadId, t.senderExternalId)],
)
