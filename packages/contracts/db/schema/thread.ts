import { sqliteTable, text, integer, index, uniqueIndex } from 'drizzle-orm/sqlite-core'
import {
	ProviderKind,
	ContactKind,
	ThreadStatus,
	BufferSize,
	TranscriptKind,
	ClassificationMethod,
	StopKind,
	StopResolution,
	DayOfWeek,
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

		/**
		 * The operator's own standing instructions for THIS conversation — null while unset.
		 *
		 * Nullable rather than `NOT NULL DEFAULT ''` because "the operator never wrote one" and "the
		 * operator wrote an empty one" are the same fact, and only one of them should be representable:
		 * the prompt builder renders the section iff there is text, so a stored `''` would be a second
		 * spelling of absent that every reader has to remember to normalize.
		 */
		customPrompt: text('custom_prompt'),

		// ThreadStatus (RUNNING | IDLE | NEEDS_ATTENTION | PAUSED).
		status: text('status').$type<ThreadStatus>().notNull(),

		/**
		 * SOFT DELETE (thread-deletion spec, decision 1) — null while the conversation is configured.
		 *
		 * A nullable timestamp rather than a boolean: "when" is the audit question the row must answer,
		 * and the whole feature is defined by rows that STAY. No child is deleted, so the transcript,
		 * issues, stops and artifacts of an apagada thread remain in the database while every console
		 * read filters on `deleted_at IS NULL` (decision 5).
		 *
		 * Deliberately NOT part of `threads_owner_channel_contact_unq`. That unique index is exactly what
		 * makes re-attach REVIVE this row (decision 4) instead of inserting a second one; admitting a
		 * duplicate for a deleted row would give one contact two transcripts and lose the "mesma conversa"
		 * property the decision names.
		 */
		deletedAt: integer('deleted_at', { mode: 'timestamp_ms' }),

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
 * `issue_stops` — the human-in-the-loop stops. Defined HERE, in the thread schema, because a Stop is a
 * CHILD OF THE THREAD aggregate since B4 (spec decision 4): `Thread.raiseStop` / `Thread.resolveStop`
 * are the only writers, and `ThreadRepository.save` persists them in the thread's transaction.
 *
 * ### The physical name stays `issue_stops` (B4, decision D-A)
 * Ownership is expressed by this file, not by the prefix. The rename is a separate front: the Go side
 * reads this table from THREE hand-written sqlc query files (`core/db/sqlite/query/{issue,thread,ui}.sql`,
 * one of them an `UPDATE`) plus six generated ones, and drizzle-kit cannot infer a table rename — it
 * emits DROP + CREATE and, under `strict: true`, asks. The Drizzle symbol (`stops`) and the index names
 * (`stops_*_idx`) were already prefix-free, so nothing in TS reads the physical name at all.
 *
 * `issue_id` is NULLABLE (B4, spec decision 4). That is the whole point of the migration: a stop can be
 * raised at THREAD level — the orchestrator's needs-approval, before any issue exists — which was
 * unreachable while `RaiseStopInputSchema`/`AskOperatorInputSchema` demanded an `issueId`. Additive: no
 * backfill, every existing row already has one.
 */
export const stops = sqliteTable(
	'issue_stops',
	{
		id: text('id').primaryKey(),

		ownerId: text('owner_id').notNull(),
		issueId: text('issue_id'),
		threadId: text('thread_id').notNull(),

		// StopKind (SERVER_ERROR | BLOCKED_BY_CLASSIFICATION | HUMAN_REQUESTED | APPROVAL_NEEDED | AUTH_REQUIRED).
		kind: text('kind').$type<StopKind>().notNull(),
		title: text('title').notNull(),
		detail: text('detail').notNull(),
		raisedAt: integer('raised_at', { mode: 'timestamp_ms' })
			.notNull()
			.$defaultFn(() => new Date()),

		// StopResolution (must match the kind) — null while open.
		resolution: text('resolution').$type<StopResolution>(),
		resolvedAt: integer('resolved_at', { mode: 'timestamp_ms' }),
	},
	t => [
		enumCheck('issue_stops_kind_check', t.kind, Object.values(StopKind)),
		enumCheck('issue_stops_resolution_check', t.resolution, Object.values(StopResolution)),
		index('stops_issue_id_idx').on(t.issueId),
		index('stops_thread_id_idx').on(t.threadId),
	],
)

/**
 * `thread_loops` — the recurring prompt an operator schedules INTO one conversation.
 *
 * A loop is a whisper with a clock: the same text `SteerThread` puts in the transcript, delivered by
 * the product itself at the hour and on the weekdays the operator chose ("toda segunda, quarta e
 * sexta às 09:00, pergunte como está o deploy"). Its own table, and not columns on `thread_threads`,
 * because a conversation has MANY of them and each has its own lifecycle — edit one, pause one, delete
 * one — which a set of columns cannot express.
 *
 * ### `next_run_at` is DERIVED, and stored anyway
 * It is `schedule.nextRunAfter(now)` and nothing else — recomputed by the aggregate on every write
 * that can move it (create, reschedule, enable, fire). It is persisted because the SWEEP has to answer
 * "which loops are due?" in SQL: with only `time_of_day` + `weekdays` + `timezone` on the row, every
 * tick would have to load every loop of every conversation and evaluate the recurrence in JS. Indexed
 * for exactly that query.
 *
 * NULL means "no next run" — the one spelling of "this loop is not scheduled", which is what
 * `enabled = false` produces. The due filter is therefore `enabled AND next_run_at <= now`, and a
 * paused loop is invisible to it by both columns.
 */
export const loops = sqliteTable(
	'thread_loops',
	{
		id: text('id').primaryKey(),

		ownerId: text('owner_id').notNull(),
		threadId: text('thread_id').notNull(),

		/** What gets whispered. The operator's words, verbatim — never a template we expand. */
		prompt: text('prompt').notNull(),

		// LoopSchedule VO (flattened): the wall-clock time, the weekdays it repeats on, and the zone
		// those two are read in. `HH:MM` as text rather than minutes-since-midnight because it is what
		// the operator typed and what the console renders back — a number would need the same
		// conversion in three places to say the same thing.
		timeOfDay: text('time_of_day').notNull(),
		// DayOfWeek[] — sqlite json, same convention as `threads.providers`.
		weekdays: text('weekdays', { mode: 'json' }).$type<DayOfWeek[]>().notNull(),
		/** IANA zone. 09:00 means 09:00 WHERE THE OPERATOR IS, which an instant alone cannot say. */
		timezone: text('timezone').notNull(),

		enabled: integer('enabled', { mode: 'boolean' }).notNull().default(true),

		/** Derived — see the table docblock. Null iff the loop is disabled. */
		nextRunAt: integer('next_run_at', { mode: 'timestamp_ms' }),
		/** When it last actually whispered — null until the first fire. The console renders it. */
		lastFiredAt: integer('last_fired_at', { mode: 'timestamp_ms' }),

		createdAt: integer('created_at', { mode: 'timestamp_ms' })
			.notNull()
			.$defaultFn(() => new Date()),
		updatedAt: integer('updated_at', { mode: 'timestamp_ms' })
			.notNull()
			.$defaultFn(() => new Date()),
		version: integer('version').notNull().default(1),
	},
	t => [
		index('loops_thread_id_idx').on(t.threadId),
		// THE SWEEP'S index — `FireDueLoops` runs every minute for as long as the daemon is up, so the
		// one query it makes must never be a table scan.
		index('loops_next_run_at_idx').on(t.nextRunAt),
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
	t => [
		uniqueIndex('consumed_messages_channel_message_unq').on(t.channelId, t.platformMessageId),
		// The REVERSE lookup: a transcript entry → the platform id it became. Quoting the message that
		// opened an issue reads this way; the unique index above only serves the inbound direction.
		index('consumed_messages_entry_idx').on(t.entryId),
	],
)
