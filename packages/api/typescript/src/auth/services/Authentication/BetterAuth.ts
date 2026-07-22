// Recipe: dev:packages/api/src/auth/services/Authentication/BetterAuth.ts
// Simplified: no clinic-switching, no email provider, credentials only.
import { singleton } from 'tsyringe-neo'
import { betterAuth, type BetterAuthOptions } from 'better-auth'
import { customSession } from 'better-auth/plugins'
import { drizzleAdapter } from 'better-auth/adapters/drizzle'
import { DrizzleClient, Config, Id } from '@template/core-typescript'
import * as schema from '@template/contracts/db'
import { IdentityAuthHooks } from '@auth/services/IdentityAuthHooks'

export type BetterAuthInstance = ReturnType<typeof betterAuth>

@singleton()
export class BetterAuth {
	readonly auth: BetterAuthInstance
	constructor(
		private client: DrizzleClient,
		private identityHooks: IdentityAuthHooks,
	) {
		// Annotate as BetterAuthOptions so the literal widens before betterAuth()
		// infers its generic. Without the annotation TS narrows `baseURL` to
		// `string`, which then conflicts with the library's `BaseURLConfig | undefined`
		// when the return type round-trips through ReturnType<typeof betterAuth>.
		const options: BetterAuthOptions = {
			baseURL: Config.env.BETTER_AUTH_URL,
			secret: Config.env.BETTER_AUTH_SECRET,
			trustedOrigins: Config.env.CORS_ALLOWED_ORIGINS,
			// Force UUIDv7 IDs for users/sessions so they round-trip through
			// the uuid-typed columns we use for domain-event entity_id /
			// owner_id. Without this, BetterAuth's default alphanumeric IDs
			// cause PG 22P02 "invalid_text_representation" when
			// IdentityAuthHooks saves events keyed by userId. The "uuid"
			// shorthand sends `default` in INSERT statements which needs a
			// column-level DEFAULT (auth.users.id has none) — a custom
			// generator dodges that by sending the value client-side.
			advanced: { database: { generateId: () => Id.value() } },
			database: drizzleAdapter(this.client, {
				provider: 'pg',
				schema: {
					user: schema.users,
					session: schema.sessions,
					account: schema.accounts,
					verification: schema.verificationTokens,
				},
			}),
			session: {
				additionalFields: {
					activeOwnerId: {
						type: 'string',
						required: false,
						defaultValue: null,
						input: false, // not set at sign-in time; set via SetActiveOwner
					},
				},
			},
			plugins: [
				customSession(async ({ user, session }) => {
					const ctx = await this.identityHooks.sessionContext(session.id)
					return { user, session: { ...session, activeOwnerId: ctx.activeOwnerId } }
				}),
			],
			// EVERY callback below is pure wiring — a single identityHooks call, zero business
			// logic in this options literal (emails, filters and reads live on the adapter).
			emailAndPassword: {
				enabled: true,
				sendResetPassword: async ({ user, url }) =>
					this.identityHooks.onPasswordResetRequested({ userId: user.id, email: user.email, name: user.name, url }),
				onPasswordReset: async ({ user }) => this.identityHooks.onPasswordReset({ userId: user.id }),
			},
			databaseHooks: {
				user: {
					create: {
						after: async user => this.identityHooks.onUserCreated({ userId: user.id, email: user.email, name: user.name }),
					},
				},
				session: {
					create: {
						after: async session => {
							await this.identityHooks.onSessionCreated({
								userId: session.userId,
							})
						},
					},
					delete: {
						after: async session => {
							await this.identityHooks.onSessionDeleted({
								userId: session.userId,
							})
						},
					},
				},
				account: {
					update: {
						after: async account => this.identityHooks.onAccountUpdated({ providerId: account.providerId, userId: account.userId }),
					},
				},
			},
		}
		this.auth = betterAuth(options)
	}
}
