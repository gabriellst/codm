// Resurrected from f21be114^ (the operator collapse) and adapted for SP2's cloud profile —
// social-only (GitHub + Google), no email/password, no MailSender.
//
// Scope of this cut: T1 wires the better-auth INSTANCE and its social providers so
// GET/POST /api/auth/* answers with GitHub + Google configured. The lifecycle bridge the original
// file had (`IdentityAuthHooks` — domain events on user/session create, password-reset emails) was
// removed with the operator collapse and is NOT recreated here: SP2 has no email/password screens
// (spec decision — social-only v1) and no BC1 identity domain-event flow in scope. `databaseHooks`
// is therefore dropped rather than wired to a bridge that no longer exists.
import { injectable } from 'tsyringe-neo'
import { betterAuth, type BetterAuthOptions } from 'better-auth'
import { drizzleAdapter } from 'better-auth/adapters/drizzle'
import { DrizzleClient, Config, Id } from '@codm/core-typescript'
import * as schema from '@codm/contracts/db'

export type BetterAuthInstance = ReturnType<typeof betterAuth>

// @injectable(), not @singleton() — this token's singleton-ness is owned by the registry
// ({ token: BetterAuth, mock: null, real: BetterAuth } in auth/registry.ts), same pattern as the
// original file's IdentityAuthHooks sibling.
@injectable()
export class BetterAuth {
	readonly auth: BetterAuthInstance

	constructor(private client: DrizzleClient) {
		// Annotate as BetterAuthOptions so the literal widens before betterAuth() infers its
		// generic — same reasoning as the original file (see git blame f21be114^).
		const options: BetterAuthOptions = {
			baseURL: Config.env.CODM_CLOUD_URL,
			basePath: '/api/auth',
			secret: Config.env.BETTER_AUTH_SECRET,
			// better-auth's OWN CSRF/cookie trust list — the cloud deployment's own origin. Distinct
			// from CORS_ALLOWED_ORIGINS, which governs the general API's cross-origin JSON allowlist.
			trustedOrigins: [Config.env.CODM_CLOUD_URL],
			// Force UUIDv7 ids for users/sessions/accounts/verifications so they stay consistent with
			// every other entity id in the system (Id.value()) instead of better-auth's default
			// alphanumeric generator.
			advanced: { database: { generateId: () => Id.value() } },
			database: drizzleAdapter(this.client, {
				// CODM persists to a single SQLite file (libsql), not Postgres — the resurrected file
				// targeted 'pg'; this is the load-bearing delta for this fork.
				provider: 'sqlite',
				schema: {
					user: schema.users,
					session: schema.sessions,
					account: schema.accounts,
					verification: schema.verificationTokens,
				},
			}),
			session: {
				additionalFields: {
					// Reserved for the owner-switching seam (see auth/schemas/SessionSchema.ts) — not
					// set at sign-in time, populated by a future SetActiveOwner use case. Exposed here so
					// a later AuthAccountMiddleware can read it straight off the better-auth session
					// output; better-auth includes declared additionalFields in its default session
					// response, so no customSession plugin is needed just to surface this field.
					activeOwnerId: {
						type: 'string',
						required: false,
						defaultValue: null,
						input: false,
					},
				},
			},
			socialProviders: {
				github: {
					clientId: Config.env.GITHUB_CLIENT_ID,
					clientSecret: Config.env.GITHUB_CLIENT_SECRET,
				},
				google: {
					clientId: Config.env.GOOGLE_CLIENT_ID,
					clientSecret: Config.env.GOOGLE_CLIENT_SECRET,
				},
			},
		}
		this.auth = betterAuth(options)
	}
}
