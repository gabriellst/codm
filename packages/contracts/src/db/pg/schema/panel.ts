import { pgSchema, text, timestamp, boolean, jsonb, index, uniqueIndex } from 'drizzle-orm/pg-core'
import { IssueLifeState, IssueStatus } from '../../../../generated/typescript/src/wire/enums'
import { enumCheck } from './_enum'

/**
 * `panel_*` — the CLOUD projection behind the per-group web panel (fase 1 of the "tarefas visíveis"
 * plan, `.specs/2026-11-13-painel-na-nuvem-design.md`).
 *
 * Cloud-only on purpose: the daemon owns issues on the user's machine; what lives here is a READ
 * snapshot it pushes (`PUT /panel/sync`) so the people in a group can see the board without the desktop
 * app. Nothing in the cloud writes an issue — it only stores what the daemon last reported.
 */
export const panelSchema = pgSchema('panel')

/** One WhatsApp group (a daemon thread) that has a panel link. The token IS the access: whoever has it sees the group. */
export const panelGroups = panelSchema.table(
	'panel_groups',
	{
		threadId: text('thread_id').primaryKey(),
		ownerId: text('owner_id').notNull(),
		name: text('name').notNull(),
		/** 32 random bytes, base64url. Rotating it (`POST /panel/groups/:threadId/rotate`) kills the old link. */
		token: text('token').notNull(),
		createdAt: timestamp('created_at', { withTimezone: true, mode: 'date' })
			.notNull()
			.$defaultFn(() => new Date()),
		rotatedAt: timestamp('rotated_at', { withTimezone: true, mode: 'date' }),
	},
	t => [uniqueIndex('panel_groups_token_unq').on(t.token), index('panel_groups_owner_idx').on(t.ownerId)],
)

/** One issue as the daemon last reported it — the card and, in `timeline`, its full timeline. */
export const panelIssues = panelSchema.table(
	'panel_issues',
	{
		issueId: text('issue_id').primaryKey(),
		ownerId: text('owner_id').notNull(),
		threadId: text('thread_id').notNull(),
		key: text('key').notNull(),
		title: text('title').notNull(),
		status: text('status').$type<IssueStatus>().notNull(),
		lifeState: text('life_state').$type<IssueLifeState>().notNull(),
		waitingForProviderUntil: timestamp('waiting_for_provider_until', { withTimezone: true, mode: 'date' }),
		archived: boolean('archived').notNull().default(false),
		/** The `GetIssueTimeline` items, verbatim — the panel renders them; nothing here queries inside. */
		timeline: jsonb('timeline').notNull(),
		updatedAt: timestamp('updated_at', { withTimezone: true, mode: 'date' }).notNull(),
	},
	t => [
		enumCheck('panel_issues_status_check', t.status, Object.values(IssueStatus)),
		enumCheck('panel_issues_life_state_check', t.lifeState, Object.values(IssueLifeState)),
		index('panel_issues_thread_idx').on(t.threadId),
	],
)

/** When each owner's daemon last reported — what the panel shows as "sem contato há N min". */
export const panelDaemons = panelSchema.table('panel_daemons', {
	ownerId: text('owner_id').primaryKey(),
	lastSeenAt: timestamp('last_seen_at', { withTimezone: true, mode: 'date' }).notNull(),
})
