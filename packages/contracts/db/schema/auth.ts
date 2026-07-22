import { pgSchema, text, timestamp, boolean, uuid, integer, index, uniqueIndex } from 'drizzle-orm/pg-core'

export const authSchema = pgSchema('authentication')

export const users = authSchema.table('users', {
	id: text('id').primaryKey(),
	email: text('email').notNull().unique(),
	emailVerified: boolean('email_verified').notNull().default(false),
	name: text('name'),
	image: text('image'),
	createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
	updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
})

export const accounts = authSchema.table('accounts', {
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
	accessTokenExpiresAt: timestamp('access_token_expires_at', { withTimezone: true }),
	scope: text('scope'),
	createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
	updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
})

export const sessions = authSchema.table('sessions', {
	id: text('id').primaryKey(),
	userId: text('user_id')
		.notNull()
		.references(() => users.id, { onDelete: 'cascade' }),
	token: text('token').notNull().unique(),
	expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
	ipAddress: text('ip_address'),
	userAgent: text('user_agent'),
	activeOwnerId: uuid('active_owner_id'),
	createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
	updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
})

export const verificationTokens = authSchema.table('verification_tokens', {
	id: text('id').primaryKey(),
	identifier: text('identifier').notNull(),
	value: text('value').notNull(),
	expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
	createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
	updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
})

// ── User-supplement tables (former `identity` pgSchema, folded into `authentication` when the
// identity context collapsed into auth). BetterAuth owns `users`; these supplement it 1:1/N:1. ──

/**
 * `user_profiles` — supplementary user fields (timezone, language). FK 1:1 to
 * authentication.users(id). Lifecycle facts (lead attribution, disablement) are EVENTS,
 * not columns here.
 */
export const userProfiles = authSchema.table('user_profiles', {
	// 1:1 with authentication.users — same id so joins use the same
	// key. Text because BetterAuth uses text PKs.
	id: text('id')
		.primaryKey()
		.references(() => users.id, { onDelete: 'cascade' }),

	// IANA timezone for the User's local-time formatting + scheduling.
	timezone: text('timezone'),

	// Display language (BCP-47, e.g. "pt-BR", "en-US"). Drives i18n
	// + notification templates.
	language: text('language'),

	// Audit / optimistic concurrency.
	createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
	updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
	version: integer('version').notNull().default(1),
})

/**
 * `fcm_registration_tokens` — one row per registered device. A User may register multiple devices;
 * each row carries the token + platform tag (IOS/ANDROID/WEB). Tokens rotate; RegisterFcmToken
 * UPSERTs by (userId, token).
 */
export const fcmRegistrationTokens = authSchema.table(
	'fcm_registration_tokens',
	{
		id: uuid('id').primaryKey().defaultRandom(),

		userId: text('user_id')
			.notNull()
			.references(() => users.id, { onDelete: 'cascade' }),

		// FCM-issued token string. Long opaque. Globally unique by definition.
		token: text('token').notNull(),

		// FcmPlatform enum (IOS | ANDROID | WEB).
		platform: text('platform').notNull(),

		// Last time the client confirmed the token is still active
		// (heartbeat ping). Stale tokens get pruned by a background job.
		lastSeenAt: timestamp('last_seen_at', { withTimezone: true }).notNull().defaultNow(),

		// Audit.
		createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
		updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
		version: integer('version').notNull().default(1),
	},
	t => ({
		tokenUnq: uniqueIndex('fcm_registration_tokens_token_unq').on(t.token),
		userIdx: index('fcm_registration_tokens_user_id_idx').on(t.userId),
		lastSeenAtIdx: index('fcm_registration_tokens_last_seen_at_idx').on(t.lastSeenAt),
	}),
)
