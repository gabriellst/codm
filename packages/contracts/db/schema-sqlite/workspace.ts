import { sqliteTable, text, integer, index, uniqueIndex } from 'drizzle-orm/sqlite-core'
import type { WorkspaceBadge } from '../../generated/typescript/src/wire/enums'

/**
 * `workspace` (pgSchema namespace) → `workspace_*` table prefix. SQLite-dialect
 * mirror of db/schema/workspace.ts. `badges` was a pg `text[]`; SQLite has no array
 * type, so it becomes `text { mode: 'json' }` (a JSON-encoded WorkspaceBadge[]).
 */
export const workspaces = sqliteTable(
	'workspace_workspaces',
	{
		id: text('id').primaryKey(),

		ownerId: text('owner_id').notNull(),

		// Absolute path selected via the native folder picker. Unique per owner.
		path: text('path').notNull(),

		// Detected badges (GIT | CLAUDE_PROJECT). pg text[] → sqlite json text.
		badges: text('badges', { mode: 'json' }).$type<WorkspaceBadge[]>().notNull(),

		addedAt: integer('added_at', { mode: 'timestamp_ms' })
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
	t => [uniqueIndex('workspaces_owner_path_unq').on(t.ownerId, t.path), index('workspaces_owner_id_idx').on(t.ownerId)],
)
