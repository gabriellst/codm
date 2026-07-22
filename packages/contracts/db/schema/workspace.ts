import { pgSchema, uuid, text, timestamp, integer, index, uniqueIndex } from 'drizzle-orm/pg-core'
// Enum column types — single-sourced from the generated wire binding (type-only, erased at compile).
import type { WorkspaceBadge } from '../../generated/typescript/src/wire/enums'

/**
 * `workspace` — BC2 Workspace Registry (TS-owned). The catalog of local project folders the
 * operator registered, with their detected traits.
 *
 * Tables:
 *   - `workspaces` — the Workspace aggregate. Absolute path is unique per owner (dedupe on add);
 *     `badges` is the detected-trait set (GIT / CLAUDE_PROJECT), stored as a text[] of the
 *     WorkspaceBadge wire enum. Removal is blocked by the domain while an issue is WORKING on it
 *     (invariant lives in the aggregate, not the schema).
 */
export const workspaceSchema = pgSchema('workspace')

export const workspaces = workspaceSchema.table(
	'workspaces',
	{
		id: uuid('id').primaryKey().defaultRandom(),

		// Owner scope — single constant operator in CodeDM, but the axis is preserved.
		ownerId: uuid('owner_id').notNull(),

		// Absolute path selected via the native folder picker. Unique per owner.
		path: text('path').notNull(),

		// Detected badges (GIT | CLAUDE_PROJECT). WorkspaceBadge wire enum, stored as text[].
		badges: text('badges').array().$type<WorkspaceBadge[]>().notNull(),

		// When the operator registered the folder.
		addedAt: timestamp('added_at', { withTimezone: true }).notNull().defaultNow(),

		// Audit / optimistic concurrency.
		createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
		updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
		version: integer('version').notNull().default(1),
	},
	t => ({
		// Absolute-path uniqueness (dedupe by absolute path) — scoped to the owner.
		ownerPathUnq: uniqueIndex('workspaces_owner_path_unq').on(t.ownerId, t.path),
		ownerIdx: index('workspaces_owner_id_idx').on(t.ownerId),
	}),
)
