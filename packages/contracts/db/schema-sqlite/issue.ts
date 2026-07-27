import { sqliteTable, text, integer, index, uniqueIndex } from 'drizzle-orm/sqlite-core'
import {
	IssueStatus,
	ProviderKind,
	StopKind,
	StopResolution,
	IssueArchiveReason,
} from '../../generated/typescript/src/wire/enums'
import { enumCheck } from './_enum'

/**
 * `issue` (pgSchema namespace) → `issue_*` table prefix. SQLite-dialect mirror of
 * db/schema/issue.ts. Issues as units of concurrent work — the per-issue stops
 * (human-in-the-loop), the terminal log, and the global stop-criteria config.
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

		archived: integer('archived', { mode: 'boolean' }).notNull().default(false),
		// IssueArchiveReason (MANUAL | THREAD_DETACHED) — set only when archived.
		archiveReason: text('archive_reason').$type<IssueArchiveReason>(),
		completedAt: integer('completed_at', { mode: 'timestamp_ms' }),

		createdAt: integer('created_at', { mode: 'timestamp_ms' }).notNull().$defaultFn(() => new Date()),
		updatedAt: integer('updated_at', { mode: 'timestamp_ms' }).notNull().$defaultFn(() => new Date()),
		version: integer('version').notNull().default(1),
	},
	t => ({
		statusCheck: enumCheck('issue_issues_status_check', t.status, Object.values(IssueStatus)),
		providerCheck: enumCheck('issue_issues_provider_check', t.provider, Object.values(ProviderKind)),
		archiveReasonCheck: enumCheck('issue_issues_archive_reason_check', t.archiveReason, Object.values(IssueArchiveReason)),
		threadKeyUnq: uniqueIndex('issues_thread_key_unq').on(t.threadId, t.key),
		ownerStatusIdx: index('issues_owner_status_idx').on(t.ownerId, t.status),
		threadIdx: index('issues_thread_id_idx').on(t.threadId),
		completedAtIdx: index('issues_completed_at_idx').on(t.completedAt),
	}),
)

export const stops = sqliteTable(
	'issue_stops',
	{
		id: text('id').primaryKey(),

		ownerId: text('owner_id').notNull(),
		issueId: text('issue_id').notNull(),
		threadId: text('thread_id').notNull(),

		// StopKind (SERVER_ERROR | BLOCKED_BY_CLASSIFICATION | HUMAN_REQUESTED | APPROVAL_NEEDED | AUTH_REQUIRED).
		kind: text('kind').$type<StopKind>().notNull(),
		title: text('title').notNull(),
		detail: text('detail').notNull(),
		raisedAt: integer('raised_at', { mode: 'timestamp_ms' }).notNull().$defaultFn(() => new Date()),

		// StopResolution (must match the kind) — null while open.
		resolution: text('resolution').$type<StopResolution>(),
		resolvedAt: integer('resolved_at', { mode: 'timestamp_ms' }),
	},
	t => ({
		kindCheck: enumCheck('issue_stops_kind_check', t.kind, Object.values(StopKind)),
		resolutionCheck: enumCheck('issue_stops_resolution_check', t.resolution, Object.values(StopResolution)),
		issueIdx: index('stops_issue_id_idx').on(t.issueId),
		threadIdx: index('stops_thread_id_idx').on(t.threadId),
	}),
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
	t => ({
		issueSeqUnq: uniqueIndex('terminal_lines_issue_seq_unq').on(t.issueId, t.seq),
	}),
)

export const stopPolicyConfig = sqliteTable('issue_stop_policy_config', {
	// One row per owner (global toggles). ownerId is the PK — a settings singleton.
	ownerId: text('owner_id').primaryKey(),

	serverErrors: integer('server_errors', { mode: 'boolean' }).notNull().default(true),
	blockedByClassification: integer('blocked_by_classification', { mode: 'boolean' }).notNull().default(true),
	humanRequested: integer('human_requested', { mode: 'boolean' }).notNull().default(true),
	approvalNeeded: integer('approval_needed', { mode: 'boolean' }).notNull().default(true),
	authRequired: integer('auth_required', { mode: 'boolean' }).notNull().default(true),

	updatedAt: integer('updated_at', { mode: 'timestamp_ms' }).notNull().$defaultFn(() => new Date()),
	version: integer('version').notNull().default(1),
})
