import { sqliteTable, text, integer, index } from 'drizzle-orm/sqlite-core'

/**
 * `authentication` (pgSchema namespace) → `authentication_*` table prefix.
 * SQLite-dialect mirror of db/schema/auth.ts. BetterAuth-owned identity tables
 * (text PKs, already text on pg) plus the user-supplement `user_profiles`.
 *
 * NOTE: the go-domain port collapses auth to a thin single-operator middleware
 * (OPERATOR_ID const, no better-auth) — that is a later phase. Phase 0.1 mirrors
 * the schema faithfully so the pipeline round-trips the full table set.
 */
export const users = sqliteTable('authentication_users', {
	id: text('id').primaryKey(),
	email: text('email').notNull().unique(),
	emailVerified: integer('email_verified', { mode: 'boolean' }).notNull().default(false),
	name: text('name'),
	image: text('image'),
	createdAt: integer('created_at', { mode: 'timestamp_ms' })
		.notNull()
		.$defaultFn(() => new Date()),
	updatedAt: integer('updated_at', { mode: 'timestamp_ms' })
		.notNull()
		.$defaultFn(() => new Date()),
})

export const accounts = sqliteTable('authentication_accounts', {
	id: text('id').primaryKey(),
	userId: text('user_id')
		.notNull()
		.references(() => users.id, { onDelete: 'cascade' }),
	providerId: text('provider_id').notNull(),
	accountId: text('account_id').notNull(),
	password: text('password'),
	accessToken: text('access_token'),
	refreshToken: text('refresh_token'),
	idToken: text('id_token'),
	accessTokenExpiresAt: integer('access_token_expires_at', { mode: 'timestamp_ms' }),
	// better-auth@1.6's account schema declares this alongside accessTokenExpiresAt (both nullish) —
	// Google's offline-access grant returns a refresh-token expiry; without the column the drizzle
	// adapter's checkMissingFields throws the first time that value is present (SP2 T1).
	refreshTokenExpiresAt: integer('refresh_token_expires_at', { mode: 'timestamp_ms' }),
	scope: text('scope'),
	createdAt: integer('created_at', { mode: 'timestamp_ms' })
		.notNull()
		.$defaultFn(() => new Date()),
	updatedAt: integer('updated_at', { mode: 'timestamp_ms' })
		.notNull()
		.$defaultFn(() => new Date()),
})

export const sessions = sqliteTable('authentication_sessions', {
	id: text('id').primaryKey(),
	userId: text('user_id')
		.notNull()
		.references(() => users.id, { onDelete: 'cascade' }),
	token: text('token').notNull().unique(),
	expiresAt: integer('expires_at', { mode: 'timestamp_ms' }).notNull(),
	ipAddress: text('ip_address'),
	userAgent: text('user_agent'),
	// uuid → text.
	activeOwnerId: text('active_owner_id'),
	createdAt: integer('created_at', { mode: 'timestamp_ms' })
		.notNull()
		.$defaultFn(() => new Date()),
	updatedAt: integer('updated_at', { mode: 'timestamp_ms' })
		.notNull()
		.$defaultFn(() => new Date()),
})

export const verificationTokens = sqliteTable('authentication_verification_tokens', {
	id: text('id').primaryKey(),
	identifier: text('identifier').notNull(),
	value: text('value').notNull(),
	expiresAt: integer('expires_at', { mode: 'timestamp_ms' }).notNull(),
	createdAt: integer('created_at', { mode: 'timestamp_ms' })
		.notNull()
		.$defaultFn(() => new Date()),
	updatedAt: integer('updated_at', { mode: 'timestamp_ms' })
		.notNull()
		.$defaultFn(() => new Date()),
})

/**
 * `user_profiles` — 1:1 supplement to authentication.users (former `identity`
 * pgSchema, folded into `authentication`).
 */
export const userProfiles = sqliteTable('authentication_user_profiles', {
	id: text('id')
		.primaryKey()
		.references(() => users.id, { onDelete: 'cascade' }),
	timezone: text('timezone'),
	language: text('language'),
	createdAt: integer('created_at', { mode: 'timestamp_ms' })
		.notNull()
		.$defaultFn(() => new Date()),
	updatedAt: integer('updated_at', { mode: 'timestamp_ms' })
		.notNull()
		.$defaultFn(() => new Date()),
	version: integer('version').notNull().default(1),
})

/**
 * `device_tokens` — the desktop's long-lived credential (SP2 T2, spec decision 4). `tokenHash` is
 * the ONLY form ever written here; the plaintext exists once, inside `DeviceToken.issue()`'s return
 * value, and goes straight to the OS keychain (desktop-shell secrets seam) — never this table.
 */
export const deviceTokens = sqliteTable(
	'authentication_device_tokens',
	{
		id: text('id').primaryKey(),
		userId: text('user_id')
			.notNull()
			.references(() => users.id, { onDelete: 'cascade' }),
		tokenHash: text('token_hash').notNull().unique(),
		label: text('label').notNull(),
		revokedAt: integer('revoked_at', { mode: 'timestamp_ms' }),
		createdAt: integer('created_at', { mode: 'timestamp_ms' })
			.notNull()
			.$defaultFn(() => new Date()),
		updatedAt: integer('updated_at', { mode: 'timestamp_ms' })
			.notNull()
			.$defaultFn(() => new Date()),
		version: integer('version').notNull().default(1),
	},
	t => [index('device_tokens_user_id_idx').on(t.userId)],
)

/**
 * `device_codes` — the one-time exchange code minted right after OAuth completes and traded for a
 * device token (spec decision 4). Deliberately NOT an entity/aggregate: it is an ephemeral value
 * with a single transition (unconsumed → consumed) and a 2-minute lifetime, the same INFRA-ledger
 * shape as `ConsumedMessageRepository`/`MailboxRepository` — exactly-once consumption is the whole
 * point, not a business invariant worth an aggregate. Owned by `DeviceTokenRepository` (repository
 * skill bp-12 case 1) since the code exists for exactly one purpose: becoming a DeviceToken.
 */
export const deviceCodes = sqliteTable('authentication_device_codes', {
	code: text('code').primaryKey(),
	userId: text('user_id')
		.notNull()
		.references(() => users.id, { onDelete: 'cascade' }),
	expiresAt: integer('expires_at', { mode: 'timestamp_ms' }).notNull(),
	consumedAt: integer('consumed_at', { mode: 'timestamp_ms' }),
	createdAt: integer('created_at', { mode: 'timestamp_ms' })
		.notNull()
		.$defaultFn(() => new Date()),
})
