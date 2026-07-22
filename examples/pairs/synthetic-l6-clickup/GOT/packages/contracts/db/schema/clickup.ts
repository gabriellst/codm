import { pgSchema, uuid, text, timestamp, integer, jsonb, index } from 'drizzle-orm/pg-core'
import { sql } from 'drizzle-orm'

/**
 * `clickup` is the ClickUp bounded context schema.
 *
 * Owns the workspace/space/list/task hierarchy and the
 * read-side projections (list view, board view) that drive
 * the live UI via SSE.
 *
 * Tables:
 *   - `workspaces`         — top-level tenancy unit
 *   - `spaces`             — workflow space within a workspace
 *   - `lists`              — ordered list within a space
 *   - `tasks`              — task write-model
 *   - `clickup_list_view`  — read projection: tasks ordered by position within a list
 *   - `clickup_board_view` — read projection: tasks grouped by status within a space
 */
export const clickupSchema = pgSchema('clickup')

export const workspaces = clickupSchema.table('workspaces', {
	id: uuid('id').primaryKey(),
	name: text('name').notNull(),
	ownerId: text('owner_id').notNull(),
	createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
	updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
	version: integer('version').notNull().default(1),
})

export const spaces = clickupSchema.table(
	'spaces',
	{
		id: uuid('id').primaryKey(),
		workspaceId: uuid('workspace_id').notNull(),
		name: text('name').notNull(),
		ownerId: text('owner_id').notNull(),
		createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
		updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
		version: integer('version').notNull().default(1),
	},
	t => ({
		workspaceIdx: index('spaces_workspace_id_idx').on(t.workspaceId),
	}),
)

export const lists = clickupSchema.table(
	'lists',
	{
		id: uuid('id').primaryKey(),
		spaceId: uuid('space_id').notNull(),
		name: text('name').notNull(),
		position: integer('position').notNull(),
		ownerId: text('owner_id').notNull(),
		createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
	},
	t => ({
		spaceIdx: index('lists_space_id_idx').on(t.spaceId),
	}),
)

export const tasks = clickupSchema.table(
	'tasks',
	{
		id: uuid('id').primaryKey(),
		workspaceId: uuid('workspace_id').notNull(),
		spaceId: uuid('space_id').notNull(),
		listId: uuid('list_id').notNull(),
		title: text('title').notNull(),
		status: text('status').notNull(),
		priority: text('priority').notNull(),
		assigneeIds: jsonb('assignee_ids')
			.notNull()
			.default(sql`'[]'::jsonb`)
			.$type<string[]>(),
		position: integer('position').notNull(),
		ownerId: text('owner_id').notNull(),
		createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
		updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
		version: integer('version').notNull().default(1),
	},
	t => ({
		spaceIdx: index('tasks_space_id_idx').on(t.spaceId),
		listIdx: index('tasks_list_id_idx').on(t.listId),
	}),
)

export const clickupListView = clickupSchema.table(
	'clickup_list_view',
	{
		taskId: uuid('task_id').primaryKey(),
		spaceId: uuid('space_id').notNull(),
		listId: uuid('list_id').notNull(),
		title: text('title').notNull(),
		status: text('status').notNull(),
		priority: text('priority').notNull(),
		assigneeIds: jsonb('assignee_ids')
			.notNull()
			.default(sql`'[]'::jsonb`)
			.$type<string[]>(),
		position: integer('position').notNull(),
	},
	t => ({
		spaceListIdx: index('clickup_list_view_space_list_idx').on(t.spaceId, t.listId),
	}),
)

export const clickupBoardView = clickupSchema.table(
	'clickup_board_view',
	{
		taskId: uuid('task_id').primaryKey(),
		spaceId: uuid('space_id').notNull(),
		status: text('status').notNull(),
		listId: uuid('list_id').notNull(),
		title: text('title').notNull(),
		priority: text('priority').notNull(),
		assigneeIds: jsonb('assignee_ids')
			.notNull()
			.default(sql`'[]'::jsonb`)
			.$type<string[]>(),
	},
	t => ({
		spaceStatusIdx: index('clickup_board_view_space_status_idx').on(t.spaceId, t.status),
	}),
)
