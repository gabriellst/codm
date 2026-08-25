// Recipe: dev:packages/api/src/auth/registry.ts — per-env bindings for auth context.
// Stripped: no clinic-switching, no doctor/collaborator.
import './errors' // Side-effect: registers this context's error codes with the framework runtime registry.
import type { DependencyContainer } from 'tsyringe-neo'
import {
	type InstanceRegistry,
	expandBindings,
	resolve,
	Config,
	RateLimitStore,
	InMemoryRateLimitStore,
	RedisRateLimitStore,
} from '@codm/core-typescript'
import { UserRepository } from './repositories/UserRepository/UserRepository'
import { PgUserRepository } from './repositories/UserRepository/PgUserRepository'
import { MockUserRepository } from './repositories/UserRepository/MockUserRepository'
import { AccountRepository } from './repositories/AccountRepository/AccountRepository'
import { UserProfileRepository, PgUserProfileRepository, MockUserProfileRepository } from './repositories/UserProfileRepository'
import { PgAccountRepository } from './repositories/AccountRepository/PgAccountRepository'
import { MockAccountRepository } from './repositories/AccountRepository/MockAccountRepository'
import { BetterAuth, BetterAuthSocialProviders } from './services/Authentication'
import { IdentityAuthHooks } from './services/IdentityAuthHooks'
import { OwnerDirectory } from '@shared/services/OwnerDirectory'

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
	{ token: UserRepository, mock: MockUserRepository, real: PgUserRepository },
	{ token: AccountRepository, mock: MockAccountRepository, real: PgAccountRepository },
	{ token: UserProfileRepository, mock: MockUserProfileRepository, real: PgUserProfileRepository },
	// better-auth touches real identity tables and needs GITHUB/GOOGLE credentials to be meaningful —
	// declared absent in mock (flow tests never boot the cloud profile); integration/real self-bind
	// the concrete service (same self-token pattern as the pre-collapse IdentityAuthHooks). Its
	// social-provider credentials are NOT a constructor default — see BetterAuthSocialProviders below
	// — so tsyringe's own paramtype auto-injection resolves both constructor args correctly.
	{ token: BetterAuth, mock: null, real: BetterAuth },
	// A PONTE DE CICLO DE VIDA, ligada por FACTORY para adiar a resolução do diretório.
	//
	// O `OwnerDirectory` é bindado pelo registry do `owner`, e `BoundedContext.create` aplica um
	// registry por contexto ANTES de registrar as rotas daquele contexto — então a cadeia que vai do
	// `AuthPassthroughController` até aqui era percorrida antes de o `owner` existir, e o tsyringe
	// construía a classe ABSTRATA: um objeto sem métodos. Ver o docblock de `IdentityAuthHooks`.
	//
	// O thunk resolve na primeira chamada de hook, que é depois de tudo composto.
	{
		token: IdentityAuthHooks,
		mock: null,
		real: { useFactory: (c: DependencyContainer) => new IdentityAuthHooks(() => resolve(c, OwnerDirectory)) },
	},
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
	// In-memory limiter everywhere except production, which needs the shared Redis window. `e2e`
	// INHERITS the in-memory store ON PURPOSE (no declaration needed): the harness boots no Redis —
	// the same operational rule ChannelSender follows in thread/registry.ts — and it runs with
	// RATE_LIMIT_DISABLED anyway, so the pre-front binding was a production adapter that stayed
	// harmless only because nothing ever resolved it.
	{ token: RateLimitStore, mock: InMemoryRateLimitStore, integration: InMemoryRateLimitStore, real: RedisRateLimitStore },
])
