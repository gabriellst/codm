import { sqliteTable, text, integer, index, uniqueIndex } from 'drizzle-orm/sqlite-core'
import { IssueStatus, ProviderKind, IssueArchiveReason } from '../../generated/typescript/src/wire/enums'
import { enumCheck } from './_enum'

/**
 * `issue` (pgSchema namespace) → `issue_*` table prefix. SQLite-dialect mirror of
 * db/schema/issue.ts. Issues as units of concurrent work — the terminal log and
 * the global stop-criteria config. The stops themselves moved to schema-sqlite/thread.ts
 * (B4): a Stop is a child of the THREAD aggregate, not of the Issue.
 * bigint→integer (terminal_lines.seq); enum→text + CHECK.
 */
export const issues = sqliteTable(
	'issue_issues',
	{
		id: text('id').primaryKey(),

		ownerId: text('owner_id').notNull(),
		threadId: text('thread_id').notNull(),

		key: text('key').notNull(),
		title: text('title').notNull(),

		// IssueStatus (NEEDS_INPUT | WORKING | COMPLETED).
		status: text('status').$type<IssueStatus>().notNull(),
		// ProviderKind (CLAUDE_CODE | CODEX | OPENCODE).
		provider: text('provider').$type<ProviderKind>().notNull(),
		meta: text('meta'),

		/**
		 * The transcript entry whose message asked for this issue — the anchor the orchestrator's
		 * answer quotes when the work finishes (orchestrator pivot, 28-jul).
		 *
		 * NULLABLE, and deliberately so: an issue can also be born without a message behind it —
		 * `DeclareIssueOpen` when a worker splits off separable work mid-run, or the console creating
		 * one through the SDK. Making it NOT NULL would reject both. Required only on the path that
		 * has one, which is the orchestrator's `issue/create`.
		 */
		originEntryId: text('origin_entry_id'),
		/**
		 * What the operator asked for, in their words — the subagent's prompt.
		 *
		 * Distinct from `title`, which is a label for the console. Before the pivot the prompt was the
		 * raw inbound text, re-read from the transcript at spawn time; now the issue OWNS its goal,
		 * because the orchestrator restates the intent from a conversation the raw message alone does
		 * not carry. Nullable for the same two paths as `origin_entry_id`.
		 */
		goal: text('goal'),

		archived: integer('archived', { mode: 'boolean' }).notNull().default(false),
		// IssueArchiveReason (MANUAL | THREAD_DETACHED) — set only when archived.
		archiveReason: text('archive_reason').$type<IssueArchiveReason>(),
		completedAt: integer('completed_at', { mode: 'timestamp_ms' }),

		createdAt: integer('created_at', { mode: 'timestamp_ms' })
			.notNull()
			.$defaultFn(() => new Date()),
		updatedAt: integer('updated_at', { mode: 'timestamp_ms' })
			.notNull()
			.$defaultFn(() => new Date()),
		version: integer('version').notNull().default(1),
	},
	t => [
		enumCheck('issue_issues_status_check', t.status, Object.values(IssueStatus)),
		enumCheck('issue_issues_provider_check', t.provider, Object.values(ProviderKind)),
		enumCheck('issue_issues_archive_reason_check', t.archiveReason, Object.values(IssueArchiveReason)),
		uniqueIndex('issues_thread_key_unq').on(t.threadId, t.key),
		index('issues_owner_status_idx').on(t.ownerId, t.status),
		index('issues_thread_id_idx').on(t.threadId),
		index('issues_completed_at_idx').on(t.completedAt),
	],
)

export const terminalLines = sqliteTable(
	'issue_terminal_lines',
	{
		id: text('id').primaryKey(),

		ownerId: text('owner_id').notNull(),
		issueId: text('issue_id').notNull(),

		// bigint → integer. Monotonic per-issue sequence.
		seq: integer('seq').notNull(),
		line: text('line').notNull(),
		at: integer('at', { mode: 'timestamp_ms' }).notNull(),
	},
	t => [uniqueIndex('terminal_lines_issue_seq_unq').on(t.issueId, t.seq)],
)

export const stopPolicyConfig = sqliteTable('issue_stop_policy_config', {
	// One row per owner (global toggles). ownerId is the PK — a settings singleton.
	ownerId: text('owner_id').primaryKey(),

	serverErrors: integer('server_errors', { mode: 'boolean' }).notNull().default(true),
	blockedByClassification: integer('blocked_by_classification', { mode: 'boolean' }).notNull().default(true),
	humanRequested: integer('human_requested', { mode: 'boolean' }).notNull().default(true),
	approvalNeeded: integer('approval_needed', { mode: 'boolean' }).notNull().default(true),
	authRequired: integer('auth_required', { mode: 'boolean' }).notNull().default(true),

	updatedAt: integer('updated_at', { mode: 'timestamp_ms' })
		.notNull()
		.$defaultFn(() => new Date()),
	version: integer('version').notNull().default(1),
})
