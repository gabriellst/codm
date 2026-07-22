import { pgSchema, uuid, text, timestamp, integer, index } from 'drizzle-orm/pg-core'
// Enum column type — single-sourced from the generated wire binding (type-only, erased at compile).
import type { ArtifactKind } from '../../generated/typescript/src/wire/enums'

/**
 * `artifact` — BC6 Artifact Registry (Support, TS-owned). The catalog of non-code outputs produced
 * by agents (images, files, links / preview deploys), browsable per thread.
 *
 * Tables:
 *   - `artifacts` — the Artifact aggregate. `ref` is a local path (IMAGE / FILE) or a URL (LINK);
 *     `issue_id` is optional (some artifacts are thread-scoped, not issue-scoped).
 */
export const artifactSchema = pgSchema('artifact')

export const artifacts = artifactSchema.table(
	'artifacts',
	{
		id: uuid('id').primaryKey().defaultRandom(),

		ownerId: uuid('owner_id').notNull(),
		threadId: uuid('thread_id').notNull(),
		// Present when the artifact belongs to a specific issue.
		issueId: uuid('issue_id'),

		// IMAGE | FILE | LINK.
		kind: text('kind').$type<ArtifactKind>().notNull(),
		// Display name (e.g. "acme-pr-214.vercel.app", "checkout-before-after.png").
		name: text('name').notNull(),
		// Local path (IMAGE/FILE) or URL (LINK).
		ref: text('ref').notNull(),
		// Freeform meta (e.g. "Preview deploy · 2 min ago", "Screenshot · 640 KB").
		meta: text('meta').notNull(),

		recordedAt: timestamp('recorded_at', { withTimezone: true }).notNull().defaultNow(),
		createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
	},
	t => ({
		threadIdx: index('artifacts_thread_id_idx').on(t.threadId),
		issueIdx: index('artifacts_issue_id_idx').on(t.issueId),
	}),
)
