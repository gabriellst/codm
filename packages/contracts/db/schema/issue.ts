import { pgSchema, uuid, text, timestamp, integer, boolean, bigint, index, uniqueIndex } from 'drizzle-orm/pg-core'
// Enum column types — single-sourced from the generated wire binding (type-only, erased at compile).
import type { IssueStatus, ProviderKind, StopKind, StopResolution, IssueArchiveReason } from '../../generated/typescript/src/wire/enums'

/**
 * `issue` — BC5 Issue Execution (Core, TS-owned). Issues as units of concurrent work — the terminal
 * session per issue, the stops (human-in-the-loop control), the terminal log, and the global
 * stop-criteria config.
 *
 * Tables:
 *   - `issues` — the Issue aggregate. `key` is a slug unique within the thread; `archive_reason` is
 *     set only when archived. `stops` and `terminal_log` are NOT embedded (see below) because both
 *     have independent lifecycles / scale.
 *   - `stops` — the Stop entity (raise → resolve lifecycle). Queried across issues for the Needs-You
 *     panel (T14). `resolution` matches the stop kind (domain rule).
 *   - `terminal_lines` — the terminal-session transport log (high-frequency append; T12 replay).
 *     Monotonic `seq` per issue.
 *   - `stop_policy_config` — the global (per-owner) stop-criteria toggles. Demoted from an aggregate
 *     to a single settings row (StopPolicyConfig has no lifecycle/invariants).
 */
export const issueSchema = pgSchema('issue')

export const issues = issueSchema.table(
	'issues',
	{
		id: uuid('id').primaryKey().defaultRandom(),

		ownerId: uuid('owner_id').notNull(),
		threadId: uuid('thread_id').notNull(),

		// Generated slug, unique within the thread (e.g. "pix-payment"). Doubles as the issue label.
		key: text('key').notNull(),
		title: text('title').notNull(),

		// NEEDS_INPUT | WORKING | COMPLETED.
		status: text('status').$type<IssueStatus>().notNull(),
		// The provider CLI this issue runs against.
		provider: text('provider').$type<ProviderKind>().notNull(),
		// Freeform meta shown in lists (e.g. "PR #214", "needs repro").
		meta: text('meta'),

		archived: boolean('archived').notNull().default(false),
		// MANUAL | AUTO_24H | THREAD_DETACHED — set only when archived.
		archiveReason: text('archive_reason').$type<IssueArchiveReason>(),
		// Stamped on completion; starts the 24h auto-archive clock.
		completedAt: timestamp('completed_at', { withTimezone: true }),

		createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
		updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
		version: integer('version').notNull().default(1),
	},
	t => ({
		// key unique within the thread (aggregate invariant, DB-enforced).
		threadKeyUnq: uniqueIndex('issues_thread_key_unq').on(t.threadId, t.key),
		ownerStatusIdx: index('issues_owner_status_idx').on(t.ownerId, t.status),
		threadIdx: index('issues_thread_id_idx').on(t.threadId),
		// Drives the 24h auto-archive sweep (COMPLETED + completed_at <= now - 24h).
		completedAtIdx: index('issues_completed_at_idx').on(t.completedAt),
	}),
)

export const stops = issueSchema.table(
	'stops',
	{
		id: uuid('id').primaryKey().defaultRandom(),

		ownerId: uuid('owner_id').notNull(),
		issueId: uuid('issue_id').notNull(),
		// Denormalized for the per-thread Needs-You panel without a join back to issues.
		threadId: uuid('thread_id').notNull(),

		// SERVER_ERROR | BLOCKED_BY_CLASSIFICATION | HUMAN_REQUESTED | APPROVAL_NEEDED.
		kind: text('kind').$type<StopKind>().notNull(),
		title: text('title').notNull(),
		detail: text('detail').notNull(),
		raisedAt: timestamp('raised_at', { withTimezone: true }).notNull().defaultNow(),

		// Null while open; the resolution (must match the kind) + time once resolved.
		resolution: text('resolution').$type<StopResolution>(),
		resolvedAt: timestamp('resolved_at', { withTimezone: true }),
	},
	t => ({
		issueIdx: index('stops_issue_id_idx').on(t.issueId),
		threadIdx: index('stops_thread_id_idx').on(t.threadId),
	}),
)

export const terminalLines = issueSchema.table(
	'terminal_lines',
	{
		id: uuid('id').primaryKey().defaultRandom(),

		ownerId: uuid('owner_id').notNull(),
		issueId: uuid('issue_id').notNull(),

		// Monotonic per-issue sequence — ordering + dedupe for the append-only stream.
		seq: bigint('seq', { mode: 'number' }).notNull(),
		line: text('line').notNull(),
		at: timestamp('at', { withTimezone: true }).notNull(),
	},
	t => ({
		issueSeqUnq: uniqueIndex('terminal_lines_issue_seq_unq').on(t.issueId, t.seq),
	}),
)

export const stopPolicyConfig = issueSchema.table('stop_policy_config', {
	// One row per owner (global toggles). ownerId is the PK — a settings singleton.
	ownerId: uuid('owner_id').primaryKey(),

	serverErrors: boolean('server_errors').notNull().default(true),
	blockedByClassification: boolean('blocked_by_classification').notNull().default(true),
	humanRequested: boolean('human_requested').notNull().default(true),
	approvalNeeded: boolean('approval_needed').notNull().default(true),
	// AUTH_REQUIRED (phase-10 amendment): provider CLI re-login needed.
	authRequired: boolean('auth_required').notNull().default(true),

	updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
	version: integer('version').notNull().default(1),
})
