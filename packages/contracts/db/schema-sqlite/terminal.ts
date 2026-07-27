import { sqliteTable, text, integer, index, uniqueIndex } from 'drizzle-orm/sqlite-core'
import { ProviderKind } from '../../generated/typescript/src/wire/enums'
import { enumCheck } from './_enum'

/**
 * `terminal` (pgSchema namespace) → `terminal_*` table prefix. SQLite-dialect
 * mirror of db/schema/terminal.ts. The durable record of an issue's provider-CLI
 * session (one session per issue; carries `--session-id` forward + feeds prewarm).
 */
export const terminalLLMSessions = sqliteTable(
	'terminal_terminal_llm_sessions',
	{
		id: text('id').primaryKey(),

		ownerId: text('owner_id').notNull(),
		issueId: text('issue_id').notNull(),
		threadId: text('thread_id').notNull(),

		// ProviderKind wire enum (CLAUDE_CODE | CODEX | OPENCODE). text + CHECK.
		provider: text('provider').$type<ProviderKind>().notNull(),
		cwd: text('cwd').notNull(),
		claudeSessionId: text('claude_session_id').notNull(),
		lastTurnAt: integer('last_turn_at', { mode: 'timestamp_ms' }).notNull().$defaultFn(() => new Date()),

		createdAt: integer('created_at', { mode: 'timestamp_ms' }).notNull().$defaultFn(() => new Date()),
		updatedAt: integer('updated_at', { mode: 'timestamp_ms' }).notNull().$defaultFn(() => new Date()),
		version: integer('version').notNull().default(1),
	},
	t => ({
		providerCheck: enumCheck('terminal_terminal_llm_sessions_provider_check', t.provider, Object.values(ProviderKind)),
		issueUnq: uniqueIndex('terminal_llm_sessions_issue_unq').on(t.issueId),
		lastTurnIdx: index('terminal_llm_sessions_last_turn_idx').on(t.lastTurnAt),
	}),
)
