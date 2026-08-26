import { pgSchema, text, integer, boolean, timestamp, index } from 'drizzle-orm/pg-core'

/**
 * O schema `authentication` no dialeto **pg** — as tabelas de identidade (better-auth) mais o
 * suplemento `user_profiles`, o token de dispositivo e o código de troca.
 *
 * O ADR 0001 é a razão de este arquivo existir neste tronco: *"a identidade vem da nuvem"*. É aqui
 * que ela mora. O daemon local não escreve nenhuma destas tabelas — ele lê o resultado por
 * `CloudSession`, cacheado em disco.
 *
 * Os PKs já eram `text` no dialeto SQLite porque o better-auth cunha os ids, então não há
 * conversão de tipo a fazer neles.
 */

/**
 * O NAMESPACE, nativo — não um prefixo no nome (T1.9).
 *
 * Até a T1.9 este tronco declarava `pgTable('authentication_users', …)`: o namespace escondido
 * dentro do nome da tabela. Isso é a concessão do SQLite, que não TEM schema, vazada para o dialeto
 * que tem — e o `dialect.ts` mede exatamente essa regressão (DIA-07). Com o namespace nativo a
 * fronteira passa a morar no banco, onde `GRANT`, `search_path` e RLS podem falar sobre ela por
 * contexto, e não numa convenção de nomenclatura que só o código respeita.
 *
 * O dono deste namespace está declarado uma vez, em `contexts/namespaces.ts`, e é o compilador que cobra.
 */
export const authSchema = pgSchema('authentication')

export const users = authSchema.table('users', {
	id: text('id').primaryKey(),
	email: text('email').notNull().unique(),
	emailVerified: boolean('email_verified').notNull().default(false),
	name: text('name'),
	image: text('image'),
	createdAt: timestamp('created_at', { withTimezone: true, mode: 'date' })
		.notNull()
		.$defaultFn(() => new Date()),
	updatedAt: timestamp('updated_at', { withTimezone: true, mode: 'date' })
		.notNull()
		.$defaultFn(() => new Date()),
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
	accessTokenExpiresAt: timestamp('access_token_expires_at', { withTimezone: true, mode: 'date' }),
	// better-auth@1.6's account schema declares this alongside accessTokenExpiresAt (both nullish) —
	// Google's offline-access grant returns a refresh-token expiry; without the column the drizzle
	// adapter's checkMissingFields throws the first time that value is present.
	refreshTokenExpiresAt: timestamp('refresh_token_expires_at', { withTimezone: true, mode: 'date' }),
	scope: text('scope'),
	createdAt: timestamp('created_at', { withTimezone: true, mode: 'date' })
		.notNull()
		.$defaultFn(() => new Date()),
	updatedAt: timestamp('updated_at', { withTimezone: true, mode: 'date' })
		.notNull()
		.$defaultFn(() => new Date()),
})

export const sessions = authSchema.table('sessions', {
	id: text('id').primaryKey(),
	userId: text('user_id')
		.notNull()
		.references(() => users.id, { onDelete: 'cascade' }),
	token: text('token').notNull().unique(),
	expiresAt: timestamp('expires_at', { withTimezone: true, mode: 'date' }).notNull(),
	ipAddress: text('ip_address'),
	userAgent: text('user_agent'),
	activeOwnerId: text('active_owner_id'),
	createdAt: timestamp('created_at', { withTimezone: true, mode: 'date' })
		.notNull()
		.$defaultFn(() => new Date()),
	updatedAt: timestamp('updated_at', { withTimezone: true, mode: 'date' })
		.notNull()
		.$defaultFn(() => new Date()),
})

export const verificationTokens = authSchema.table('verification_tokens', {
	id: text('id').primaryKey(),
	identifier: text('identifier').notNull(),
	value: text('value').notNull(),
	expiresAt: timestamp('expires_at', { withTimezone: true, mode: 'date' }).notNull(),
	createdAt: timestamp('created_at', { withTimezone: true, mode: 'date' })
		.notNull()
		.$defaultFn(() => new Date()),
	updatedAt: timestamp('updated_at', { withTimezone: true, mode: 'date' })
		.notNull()
		.$defaultFn(() => new Date()),
})

/** `user_profiles` — 1:1 supplement to authentication.users. */
export const userProfiles = authSchema.table('user_profiles', {
	id: text('id')
		.primaryKey()
		.references(() => users.id, { onDelete: 'cascade' }),
	timezone: text('timezone'),
	language: text('language'),
	createdAt: timestamp('created_at', { withTimezone: true, mode: 'date' })
		.notNull()
		.$defaultFn(() => new Date()),
	updatedAt: timestamp('updated_at', { withTimezone: true, mode: 'date' })
		.notNull()
		.$defaultFn(() => new Date()),
	version: integer('version').notNull().default(1),
})

/**
 * `device_tokens` — a credencial de longa duração do desktop. `tokenHash` é a ÚNICA forma jamais
 * escrita aqui; o texto claro existe uma vez, dentro do retorno de `DeviceToken.issue()`, e vai
 * direto para o keychain do SO — nunca para esta tabela.
 */
export const deviceTokens = authSchema.table(
	'device_tokens',
	{
		id: text('id').primaryKey(),
		userId: text('user_id')
			.notNull()
			.references(() => users.id, { onDelete: 'cascade' }),
		tokenHash: text('token_hash').notNull().unique(),
		label: text('label').notNull(),
		revokedAt: timestamp('revoked_at', { withTimezone: true, mode: 'date' }),
		createdAt: timestamp('created_at', { withTimezone: true, mode: 'date' })
			.notNull()
			.$defaultFn(() => new Date()),
		updatedAt: timestamp('updated_at', { withTimezone: true, mode: 'date' })
			.notNull()
			.$defaultFn(() => new Date()),
		version: integer('version').notNull().default(1),
	},
	t => [index('device_tokens_user_id_idx').on(t.userId)],
)

/**
 * `device_codes` — o código de troca de uso único, cunhado logo após o OAuth completar e trocado
 * por um device token. Deliberadamente NÃO é entidade/agregado: é um valor efêmero com uma única
 * transição (não-consumido → consumido) e dois minutos de vida.
 */
export const deviceCodes = authSchema.table('device_codes', {
	code: text('code').primaryKey(),
	userId: text('user_id')
		.notNull()
		.references(() => users.id, { onDelete: 'cascade' }),
	expiresAt: timestamp('expires_at', { withTimezone: true, mode: 'date' }).notNull(),
	consumedAt: timestamp('consumed_at', { withTimezone: true, mode: 'date' }),
	createdAt: timestamp('created_at', { withTimezone: true, mode: 'date' })
		.notNull()
		.$defaultFn(() => new Date()),
})
