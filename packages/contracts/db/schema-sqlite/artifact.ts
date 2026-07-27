import { sqliteTable, text, integer, index } from 'drizzle-orm/sqlite-core'
import { ArtifactKind } from '../../generated/typescript/src/wire/enums'
import { enumCheck } from './_enum'

/**
 * `artifact` (pgSchema namespace) → `artifact_*` table prefix. SQLite-dialect
 * mirror of db/schema/artifact.ts. The catalog of non-code agent outputs
 * (images / files / links), browsable per thread.
 */
export const artifacts = sqliteTable(
	'artifact_artifacts',
	{
		id: text('id').primaryKey(),

		ownerId: text('owner_id').notNull(),
		threadId: text('thread_id').notNull(),
		issueId: text('issue_id'),

		// ArtifactKind wire enum (IMAGE | FILE | LINK). text + CHECK.
		kind: text('kind').$type<ArtifactKind>().notNull(),
		name: text('name').notNull(),
		ref: text('ref').notNull(),
		meta: text('meta').notNull(),

		recordedAt: integer('recorded_at', { mode: 'timestamp_ms' })
			.notNull()
			.$defaultFn(() => new Date()),
		createdAt: integer('created_at', { mode: 'timestamp_ms' })
			.notNull()
			.$defaultFn(() => new Date()),
	},
	t => ({
		kindCheck: enumCheck('artifact_artifacts_kind_check', t.kind, Object.values(ArtifactKind)),
		threadIdx: index('artifacts_thread_id_idx').on(t.threadId),
		issueIdx: index('artifacts_issue_id_idx').on(t.issueId),
	}),
)
