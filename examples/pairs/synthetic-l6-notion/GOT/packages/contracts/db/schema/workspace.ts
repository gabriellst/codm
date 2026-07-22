import { pgSchema, uuid, text, timestamp, integer, index } from 'drizzle-orm/pg-core'

export const workspaceSchema = pgSchema('workspace')

export const workspaces = workspaceSchema.table(
	'workspaces',
	{
		id: uuid('id').primaryKey(),
		name: text('name').notNull(),
		ownerId: uuid('owner_id').notNull(),
		createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
		updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
		version: integer('version').notNull().default(1),
	},
	t => ({
		ownerIdx: index('workspaces_owner_id_idx').on(t.ownerId),
	}),
)
