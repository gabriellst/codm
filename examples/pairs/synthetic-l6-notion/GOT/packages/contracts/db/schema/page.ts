import { pgSchema, uuid, text, timestamp, integer, jsonb, index } from 'drizzle-orm/pg-core'

export const pageSchema = pgSchema('page')

export const pages = pageSchema.table(
	'pages',
	{
		id: uuid('id').primaryKey(),
		workspaceId: uuid('workspace_id').notNull(),
		// Nullable self-reference — no FK to avoid circular-reference resolution issues
		parentPageId: uuid('parent_page_id'),
		title: text('title').notNull(),
		createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
		updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
		version: integer('version').notNull().default(1),
	},
	t => ({
		workspaceIdx: index('pages_workspace_id_idx').on(t.workspaceId),
		parentPageIdx: index('pages_parent_page_id_idx').on(t.parentPageId),
	}),
)

export const blocks = pageSchema.table(
	'blocks',
	{
		id: uuid('id').primaryKey(),
		pageId: uuid('page_id').notNull(),
		// Nullable adjacency-list self-reference — no FK
		parentBlockId: uuid('parent_block_id'),
		type: text('type').notNull(),
		content: text('content').notNull(),
		position: integer('position').notNull(),
		createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
		updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
	},
	t => ({
		pageIdx: index('blocks_page_id_idx').on(t.pageId),
		parentBlockIdx: index('blocks_parent_block_id_idx').on(t.parentBlockId),
	}),
)

export const pageViewProjection = pageSchema.table('page_view_projection', {
	pageId: uuid('page_id').primaryKey(),
	workspaceId: uuid('workspace_id').notNull(),
	title: text('title').notNull(),
	blockTree: jsonb('block_tree').notNull().default([]),
	childPages: jsonb('child_pages').notNull().default([]),
	updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
},
t => ({
	workspaceIdx: index('page_view_projection_workspace_id_idx').on(t.workspaceId),
}),
)
