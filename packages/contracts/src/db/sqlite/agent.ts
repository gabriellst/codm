import { sql } from 'drizzle-orm'
import { sqliteTable, text, integer, index, uniqueIndex } from 'drizzle-orm/sqlite-core'
import { AgentModelId, MailboxItemKind, MailboxTargetKind, ProviderKind } from '../../../generated/typescript/src/wire/enums'
import { enumCheck } from './_enum'

/**
 * `agent` (pgSchema namespace) → `agent_*` table prefix. The durable record of one issue's
 * provider-CLI session: it carries the CLI's own session id forward so the next turn can
 * `--resume` it instead of re-rendering the transcript into the prompt.
 *
 * Renamed from `terminal_terminal_llm_sessions` in GOAL-agent-abstraction Fase 4, in the SAME
 * migration that renames `claude_session_id → agent_session_id` and adds `model` + `last_message_id`
 * (§5.1 assigns the table rename here so Fase 5 stays a pure code `git mv` with no migration).
 * `claude_session_id` nailed a durable domain concept to one vendor's binary; `terminal_*` named a
 * PTY that no longer exists.
 *
 * `model` and `last_message_id` are not decoration — they are the persisted premises the resume
 * guards are decided from (`AgentSession.resumeDecision`): a session created under one model, in one
 * workspace, having consumed the conversation up to one entry, may only be resumed while all three
 * still hold. `last_message_id` is nullable because a session can exist before any turn has recorded
 * a cursor, and that state has its own named reason (`MISSING_CURSOR`) rather than a silent reset.
 */
export const agentSessions = sqliteTable(
	'agent_agent_sessions',
	{
		id: text('id').primaryKey(),

		ownerId: text('owner_id').notNull(),
		// NULL ⇒ this is the thread's ORCHESTRATOR session. See the docblock.
		issueId: text('issue_id'),
		threadId: text('thread_id').notNull(),

		// ProviderKind wire enum (CLAUDE_CODE | CODEX | OPENCODE). text + CHECK.
		provider: text('provider').$type<ProviderKind>().notNull(),
		cwd: text('cwd').notNull(),
		agentSessionId: text('agent_session_id').notNull(),
		// AgentModelId wire enum (DEFAULT | SONNET | OPUS | HAIKU). text + CHECK.
		model: text('model').$type<AgentModelId>().notNull().default(AgentModelId.DEFAULT),
		lastMessageId: text('last_message_id'),
		/**
		 * Size of the CLI's context after the last turn, read straight off the terminal frame's
		 * `usage` (`inputTokens + cacheCreationInputTokens + cacheReadInputTokens`). Nullable until a
		 * turn has reported one. This is the input to the compaction threshold — the size arrives for
		 * free with every turn, so nothing has to tokenize anything to decide.
		 */
		lastContextTokens: integer('last_context_tokens'),
		lastTurnAt: integer('last_turn_at', { mode: 'timestamp_ms' })
			.notNull()
			.$defaultFn(() => new Date()),

		createdAt: integer('created_at', { mode: 'timestamp_ms' })
			.notNull()
			.$defaultFn(() => new Date()),
		updatedAt: integer('updated_at', { mode: 'timestamp_ms' })
			.notNull()
			.$defaultFn(() => new Date()),
		version: integer('version').notNull().default(1),
	},
	t => [
		enumCheck('agent_agent_sessions_provider_check', t.provider, Object.values(ProviderKind)),
		enumCheck('agent_agent_sessions_model_check', t.model, Object.values(AgentModelId)),
		// One session per ISSUE (subagents) and one per THREAD (orchestrator) — partial, so a thread
		// can carry an orchestrator AND N issue sessions at once.
		uniqueIndex('agent_sessions_issue_unq').on(t.issueId).where(sql`issue_id IS NOT NULL`),
		uniqueIndex('agent_sessions_orchestrator_unq').on(t.threadId).where(sql`issue_id IS NULL`),
		index('agent_sessions_last_turn_idx').on(t.lastTurnAt),
	],
)

/**
 * `agent_mailbox` — the durable per-target turn queue. THE piece the orchestrator pivot rests on
 * (spec §7.4), and the answer to five separate failure modes an adversarial review found in the
 * naive design.
 *
 * ### Why a table and not "just trigger a turn"
 * The simple alternative — each producer fires a turn and retries when one is already running —
 * does not survive contact with this codebase. The outbox charges attempts at claim with a 30s
 * lease backoff and dead-letters at five, so a message arriving during a turn that lasts minutes
 * (which conversational CLI turns do) burns its budget and is dropped silently. And nothing would
 * survive a crash between "the subagent finished" and "the orchestrator was told".
 *
 * ### The shape
 * Two TARGET KINDS share one queue, which is what makes the Go-channel analogy literal: a THREAD
 * target schedules an orchestrator turn, an ISSUE target schedules a subagent turn. Producers only
 * ever INSERT, and always inside the transaction of the fact that motivates the item — the inbound
 * ingest, the `issue/create` tool call, `RunIssueTurn`'s outcome. That transactional coupling is
 * what makes delivery exactly-once without a second dedup mechanism, and it is why the result of a
 * turn can carry its own text instead of being re-derived from an event that never had it.
 *
 * The single consumer (`MailboxDispatcher`) takes a LEASE per target, so one turn per target is in
 * flight and different targets run in parallel. Producers never check whether a turn is running —
 * that check-then-act race across two independent outbox lanes was one of the blocking findings.
 *
 * Modeled on `SqliteCommandQueue`, the in-repo precedent for a durable queue: poller, lease,
 * attempts, poison. Ordering is per target, by `created_at` — the write connection's FIFO gate is
 * what makes that ordering total without a counter.
 */
export const agentMailbox = sqliteTable(
	'agent_mailbox',
	{
		id: text('id').primaryKey(),

		ownerId: text('owner_id').notNull(),

		// THREAD → an orchestrator turn; ISSUE → a subagent turn.
		targetKind: text('target_kind').$type<MailboxTargetKind>().notNull(),
		targetId: text('target_id').notNull(),

		kind: text('kind').$type<MailboxItemKind>().notNull(),
		// The item's own shape, discriminated by `kind`. Opaque here on purpose: the queue schedules
		// turns, it does not model what a turn is about.
		payload: text('payload', { mode: 'json' }).notNull(),

		/**
		 * Idempotency key of the FACT behind the item (`entryId`, `issueId:runId`, a steer's own id).
		 * The producer's transaction plus this unique index is the whole exactly-once story: a
		 * redelivered event re-inserts and conflicts instead of queueing a second turn — which would
		 * have meant a second message in the real conversation.
		 */
		dedupKey: text('dedup_key').notNull(),

		// Lease + failure vocabulary, mirroring SqliteCommandQueue: a turn that dies mid-flight has
		// its lease expire and is retried; one that keeps dying is poisoned rather than looping.
		claimedBy: text('claimed_by'),
		/**
		 * WHICH RUN OF THE DAEMON holds the lease — the two columns that make a stranded claim
		 * PROVABLY dead instead of merely old.
		 *
		 * `claimed_by` alone answers "which worker", and a worker id is a uuid minted in memory: after
		 * a crash nothing in the new process can tell whether the id on the row belongs to a run that
		 * is still going (a second daemon, legitimately) or to one that no longer exists. The only
		 * available answer to that is the OS's — `kill(pid, 0)` — and it needs a pid to ask about,
		 * plus a boot id so a RECYCLED pid (the new daemon inheriting the dead one's number) is not
		 * mistaken for the original holder.
		 *
		 * Declared as two typed columns rather than packed into `claimed_by`: WHO claimed is three
		 * facts (worker, boot, process), and a parser over a delimited string would be exactly the
		 * "convention instead of contract" the repo forbids. NULLable because rows written before this
		 * migration have no boot recorded — and a claim we cannot prove dead is never reclaimed early,
		 * it simply waits out its lease, which is the pre-existing behaviour.
		 */
		claimedBoot: text('claimed_boot'),
		claimedPid: integer('claimed_pid'),
		leaseUntil: integer('lease_until', { mode: 'timestamp_ms' }),
		attempts: integer('attempts').notNull().default(0),
		lastError: text('last_error'),
		deadAt: integer('dead_at', { mode: 'timestamp_ms' }),

		consumedAt: integer('consumed_at', { mode: 'timestamp_ms' }),
		createdAt: integer('created_at', { mode: 'timestamp_ms' })
			.notNull()
			.$defaultFn(() => new Date()),
	},
	t => [
		enumCheck('agent_mailbox_target_kind_check', t.targetKind, Object.values(MailboxTargetKind)),
		enumCheck('agent_mailbox_kind_check', t.kind, Object.values(MailboxItemKind)),
		uniqueIndex('agent_mailbox_dedup_unq').on(t.dedupKey),
		// The dispatcher's own query: the oldest unconsumed, unleased, unpoisoned item per target.
		index('agent_mailbox_pending_idx').on(t.targetKind, t.targetId, t.consumedAt, t.createdAt).where(sql`dead_at IS NULL`),
	],
)
