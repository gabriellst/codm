import { sqliteTable, text, integer, index, uniqueIndex } from 'drizzle-orm/sqlite-core'
import { AgentModelId, ProviderKind } from '../../generated/typescript/src/wire/enums'
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
		issueId: text('issue_id').notNull(),
		threadId: text('thread_id').notNull(),

		// ProviderKind wire enum (CLAUDE_CODE | CODEX | OPENCODE). text + CHECK.
		provider: text('provider').$type<ProviderKind>().notNull(),
		cwd: text('cwd').notNull(),
		agentSessionId: text('agent_session_id').notNull(),
		// AgentModelId wire enum (DEFAULT | SONNET | OPUS | HAIKU). text + CHECK.
		model: text('model').$type<AgentModelId>().notNull().default(AgentModelId.DEFAULT),
		lastMessageId: text('last_message_id'),
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
	t => ({
		providerCheck: enumCheck('agent_agent_sessions_provider_check', t.provider, Object.values(ProviderKind)),
		modelCheck: enumCheck('agent_agent_sessions_model_check', t.model, Object.values(AgentModelId)),
		issueUnq: uniqueIndex('agent_sessions_issue_unq').on(t.issueId),
		lastTurnIdx: index('agent_sessions_last_turn_idx').on(t.lastTurnAt),
	}),
)
