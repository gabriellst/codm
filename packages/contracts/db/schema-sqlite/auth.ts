import { sqliteTable, text, integer } from 'drizzle-orm/sqlite-core'

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
	createdAt: integer('created_at', { mode: 'timestamp_ms' }).notNull().$defaultFn(() => new Date()),
	updatedAt: integer('updated_at', { mode: 'timestamp_ms' }).notNull().$defaultFn(() => new Date()),
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
	scope: text('scope'),
	createdAt: integer('created_at', { mode: 'timestamp_ms' }).notNull().$defaultFn(() => new Date()),
	updatedAt: integer('updated_at', { mode: 'timestamp_ms' }).notNull().$defaultFn(() => new Date()),
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
	createdAt: integer('created_at', { mode: 'timestamp_ms' }).notNull().$defaultFn(() => new Date()),
	updatedAt: integer('updated_at', { mode: 'timestamp_ms' }).notNull().$defaultFn(() => new Date()),
})

export const verificationTokens = sqliteTable('authentication_verification_tokens', {
	id: text('id').primaryKey(),
	identifier: text('identifier').notNull(),
	value: text('value').notNull(),
	expiresAt: integer('expires_at', { mode: 'timestamp_ms' }).notNull(),
	createdAt: integer('created_at', { mode: 'timestamp_ms' }).notNull().$defaultFn(() => new Date()),
	updatedAt: integer('updated_at', { mode: 'timestamp_ms' }).notNull().$defaultFn(() => new Date()),
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
	createdAt: integer('created_at', { mode: 'timestamp_ms' }).notNull().$defaultFn(() => new Date()),
	updatedAt: integer('updated_at', { mode: 'timestamp_ms' }).notNull().$defaultFn(() => new Date()),
	version: integer('version').notNull().default(1),
})
