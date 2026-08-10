// Recipe: dev:packages/api/src/auth/registry.ts — per-env bindings for auth context.
// Stripped: no clinic-switching, no doctor/collaborator.
import './errors' // Side-effect: registers this context's error codes with the framework runtime registry.
import {
	type InstanceRegistry,
	expandBindings,
	Config,
	RateLimitStore,
	InMemoryRateLimitStore,
	RedisRateLimitStore,
} from '@codm/core-typescript'
import { UserRepository } from './repositories/UserRepository/UserRepository'
import { DrizzleUserRepository } from './repositories/UserRepository/DrizzleUserRepository'
import { MockUserRepository } from './repositories/UserRepository/MockUserRepository'
import { AccountRepository } from './repositories/AccountRepository/AccountRepository'
import { UserProfileRepository, DrizzleUserProfileRepository, MockUserProfileRepository } from './repositories/UserProfileRepository'
import { DrizzleAccountRepository } from './repositories/AccountRepository/DrizzleAccountRepository'
import { MockAccountRepository } from './repositories/AccountRepository/MockAccountRepository'
import { DeviceTokenRepository, DrizzleDeviceTokenRepository, MockDeviceTokenRepository } from './repositories/DeviceTokenRepository'
import { BetterAuth, BetterAuthSocialProviders } from './services/Authentication'
import { CloudSession, FileCloudSession, MockCloudSession } from './services/CloudSession'

// Known fixture asserted on by BetterAuth.test.ts (GitHub + Google "authorize URL carries the
// injected client id" cases) — single source so the registry's integration binding and the test's
// assertions never drift apart silently.
export const INTEGRATION_SOCIAL_PROVIDERS_FIXTURE: BetterAuthSocialProviders = {
	githubClientId: 'test-github-client-id',
	githubClientSecret: 'test-github-client-secret',
	googleClientId: 'test-google-client-id',
	googleClientSecret: 'test-google-client-secret',
}

// The `real` social-provider credentials, hoisted so the `e2e` column can DECLARE them rather than
// inherit `integration`'s test fixture — see the binding below.
const REAL_SOCIAL_PROVIDERS: BetterAuthSocialProviders = {
	githubClientId: Config.env.GITHUB_CLIENT_ID,
	githubClientSecret: Config.env.GITHUB_CLIENT_SECRET,
	googleClientId: Config.env.GOOGLE_CLIENT_ID,
	googleClientSecret: Config.env.GOOGLE_CLIENT_SECRET,
}

export const INSTANCE_REGISTRY: InstanceRegistry = expandBindings([
	{ token: UserRepository, mock: MockUserRepository, real: DrizzleUserRepository },
	{ token: AccountRepository, mock: MockAccountRepository, real: DrizzleAccountRepository },
	{ token: UserProfileRepository, mock: MockUserProfileRepository, real: DrizzleUserProfileRepository },
	{ token: DeviceTokenRepository, mock: MockDeviceTokenRepository, real: DrizzleDeviceTokenRepository },
	// better-auth touches real identity tables and needs GITHUB/GOOGLE credentials to be meaningful —
	// declared absent in mock (flow tests never boot the cloud profile); integration/real self-bind
	// the concrete service (same self-token pattern as the pre-collapse IdentityAuthHooks). Its
	// social-provider credentials are NOT a constructor default — see BetterAuthSocialProviders below
	// — so tsyringe's own paramtype auto-injection resolves both constructor args correctly.
	{ token: BetterAuth, mock: null, real: BetterAuth },
	// BetterAuth's social-provider credentials (see BetterAuth.ts docblock for why this is a class
	// token rather than a constructor default). `real` mirrors Config.env exactly like before this
	// seam existed; `integration` binds the known fixture BetterAuth.test.ts asserts on — mock stays
	// absent, same as BetterAuth itself (no cloud profile in mock, so nothing ever resolves this).
	// e2e = REAL: the harness boots the production auth wiring, so it reads the operator's own
	// credentials from Config. Declared because the chain would otherwise hand the e2e daemon
	// BetterAuth.test.ts's fixture — an integration-suite artifact with no business in a real boot.
	{
		token: BetterAuthSocialProviders,
		mock: null,
		integration: INTEGRATION_SOCIAL_PROVIDERS_FIXTURE,
		real: REAL_SOCIAL_PROVIDERS,
		e2e: REAL_SOCIAL_PROVIDERS,
	},
	// The LOCAL daemon's login gate (SP2 T7) — the mirror image of BetterAuth above: bound `real`
	// EVERYWHERE (the daemon profile always has one, unlike the cloud-only BetterAuth), by CLASS
	// REFERENCE rather than `useFactory` so it stays a true singleton — see FileCloudSession's
	// docblock for why that specific property matters here.
	// e2e = REAL: the harness boots the daemon's own login gate over its scratch data dir, exactly like
	// a desktop install. Declared because the chain would inherit MockCloudSession and quietly remove
	// the gate from the only test that boots a real daemon. (With no CODM_CLOUD_URL configured,
	// FileCloudSession's dev-compat path is entitled anyway — so this changes no spec, it just keeps
	// e2e on the class production runs.)
	{ token: CloudSession, mock: MockCloudSession, integration: MockCloudSession, real: FileCloudSession, e2e: FileCloudSession },
	// In-memory limiter everywhere except production, which needs the shared Redis window. `e2e`
	// INHERITS the in-memory store ON PURPOSE (no declaration needed): the harness boots no Redis —
	// the same operational rule ChannelSender follows in thread/registry.ts — and it runs with
	// RATE_LIMIT_DISABLED anyway, so the pre-front binding was a production adapter that stayed
	// harmless only because nothing ever resolved it.
	{ token: RateLimitStore, mock: InMemoryRateLimitStore, integration: InMemoryRateLimitStore, real: RedisRateLimitStore },
])
