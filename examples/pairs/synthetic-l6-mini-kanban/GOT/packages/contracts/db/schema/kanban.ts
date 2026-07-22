import { pgSchema, uuid, text, timestamp, integer, index } from 'drizzle-orm/pg-core'

/**
 * `kanban` schema owns the Kanban feature: boards (with ordered lists as JSON),
 * and cards. Boards own their lists as value objects persisted as ordered rows in
 * `kanban.board_lists`; cards are a separate aggregate in `kanban.cards`.
 *
 * Tables:
 *   - `boards`      — one row per kanban board, store-scoped
 *   - `board_lists` — ordered columns within a board (VOs of the Board aggregate)
 *   - `cards`       — Card aggregates, belong to a board + list
 */
export const kanbanSchema = pgSchema('kanban')

export const boards = kanbanSchema.table(
	'boards',
	{
		id: uuid('id').primaryKey().defaultRandom(),
		storeId: uuid('store_id').notNull(),
		title: text('title').notNull(),
		archivedAt: timestamp('archived_at', { withTimezone: true }),
		createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
		updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
		version: integer('version').notNull().default(1),
	},
	t => ({
		storeIdx: index('boards_store_id_idx').on(t.storeId),
	}),
)

export const boardLists = kanbanSchema.table(
	'board_lists',
	{
		id: uuid('id').primaryKey().defaultRandom(),
		boardId: uuid('board_id').notNull(),
		title: text('title').notNull(),
		position: integer('position').notNull().default(0),
		createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
	},
	t => ({
		boardIdx: index('board_lists_board_id_idx').on(t.boardId),
	}),
)

export const cards = kanbanSchema.table(
	'cards',
	{
		id: uuid('id').primaryKey().defaultRandom(),
		boardId: uuid('board_id').notNull(),
		listId: uuid('list_id').notNull(),
		title: text('title').notNull(),
		position: integer('position').notNull().default(0),
		archivedAt: timestamp('archived_at', { withTimezone: true }),
		createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
		updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
		version: integer('version').notNull().default(1),
	},
	t => ({
		boardIdx: index('cards_board_id_idx').on(t.boardId),
		listIdx: index('cards_list_id_idx').on(t.listId),
	}),
)
