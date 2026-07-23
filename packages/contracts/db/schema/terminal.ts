import { pgSchema, uuid, text, timestamp, integer, index, uniqueIndex } from 'drizzle-orm/pg-core'
// Enum column types — single-sourced from the generated wire binding (type-only, erased at compile).
import type { ProviderKind } from '../../generated/typescript/src/wire/enums'

/**
 * `terminal` — BC5 terminal-session runtime (TS-owned; phase-10 foundation runner extraction).
 *
 * Tables:
 *   - `terminal_llm_sessions` — the durable record of an issue's provider-CLI session (whatscode
 *     `terminalLLMSessions` port, rekeyed (mappingId, senderJid) → issueId per Fork B). One row per
 *     issue (unique index); carries the CLI `--session-id` forward between turns/restarts and
 *     feeds the startup prewarm sweep (recency = `last_turn_at`).
 */
export const terminalSchema = pgSchema('terminal')

export const terminalLLMSessions = terminalSchema.table(
	'terminal_llm_sessions',
	{
		id: uuid('id').primaryKey().defaultRandom(),

		ownerId: uuid('owner_id').notNull(),
		// Session identity (Fork B): one session per issue.
		issueId: uuid('issue_id').notNull(),
		threadId: uuid('thread_id').notNull(),

		// The provider CLI this session drives.
		provider: text('provider').$type<ProviderKind>().notNull(),
		// Absolute workspace path the session runs in (kept here so prewarm needs no cross-context join).
		cwd: text('cwd').notNull(),
		// The `--session-id` handed to the CLI; the JSONL transcript path derives from it.
		claudeSessionId: text('claude_session_id').notNull(),
		lastTurnAt: timestamp('last_turn_at', { withTimezone: true }).notNull().defaultNow(),

		createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
		updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
		version: integer('version').notNull().default(1),
	},
	t => ({
		// One durable session per issue (Fork B invariant, DB-enforced).
		issueUnq: uniqueIndex('terminal_llm_sessions_issue_unq').on(t.issueId),
		// Recency scan for the prewarm sweep (last_turn_at DESC LIMIT n).
		lastTurnIdx: index('terminal_llm_sessions_last_turn_idx').on(t.lastTurnAt),
	}),
)
