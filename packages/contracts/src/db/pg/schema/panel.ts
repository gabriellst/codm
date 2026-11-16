import { pgSchema, text, timestamp, boolean, jsonb, index, uniqueIndex, integer } from 'drizzle-orm/pg-core'
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

/** One person of a group as the panel knows them — opaque id, display name, the "pode liberar" grant. */
export interface PanelMember {
	memberId: string
	name: string
	canRelease: boolean
}

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
		/**
		 * The group's people as the daemon last reported them (fase 2, item 6a): `[{ memberId, name,
		 * canRelease }]`. A VALUE of the group — replaced whole on every roster push, read whole, never
		 * queried inside. `memberId` is opaque (an HMAC the daemon derives; no phone or JID ever reaches
		 * the cloud).
		 */
		members: jsonb('members').$type<PanelMember[]>().notNull().default([]),
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

/**
 * A person asked, from the panel, for a code to prove who they are (fase 2, item 6a). The row is the
 * REQUEST; the code is minted only when the daemon pulls it (`PUT /panel/roster`), and only its HMAC is
 * kept — the plain code exists in that one HTTP response and in the WhatsApp DM.
 */
export const panelCodeRequests = panelSchema.table(
	'panel_code_requests',
	{
		id: text('id').primaryKey(),
		ownerId: text('owner_id').notNull(),
		threadId: text('thread_id').notNull(),
		memberId: text('member_id').notNull(),
		requestedAt: timestamp('requested_at', { withTimezone: true, mode: 'date' }).notNull(),
		/** HMAC of `<id>:<code>`; null until the daemon pulled the request. */
		codeHash: text('code_hash'),
		issuedAt: timestamp('issued_at', { withTimezone: true, mode: 'date' }),
		expiresAt: timestamp('expires_at', { withTimezone: true, mode: 'date' }),
		/** Wrong tries so far — spent BEFORE comparing, capped at 5. */
		attempts: integer('attempts').notNull().default(0),
		usedAt: timestamp('used_at', { withTimezone: true, mode: 'date' }),
	},
	t => [
		index('panel_code_requests_member_idx').on(t.threadId, t.memberId, t.requestedAt),
		index('panel_code_requests_owner_idx').on(t.ownerId, t.requestedAt),
	],
)

/**
 * A browser that proved who it is, for one group (fase 2, item 6a). The cookie carries a random token;
 * only its SHA-256 is here. Rotating the group link deletes these.
 */
export const panelSessions = panelSchema.table(
	'panel_sessions',
	{
		tokenHash: text('token_hash').primaryKey(),
		ownerId: text('owner_id').notNull(),
		threadId: text('thread_id').notNull(),
		memberId: text('member_id').notNull(),
		createdAt: timestamp('created_at', { withTimezone: true, mode: 'date' }).notNull(),
		expiresAt: timestamp('expires_at', { withTimezone: true, mode: 'date' }).notNull(),
	},
	t => [index('panel_sessions_thread_idx').on(t.threadId), index('panel_sessions_owner_idx').on(t.ownerId, t.expiresAt)],
)
