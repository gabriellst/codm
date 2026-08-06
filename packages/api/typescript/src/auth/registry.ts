// Recipe: dev:packages/api/src/auth/registry.ts — per-env bindings for auth context.
// Stripped: no clinic-switching, no doctor/collaborator.
import './errors' // Side-effect: registers this context's error codes with the framework runtime registry.
import { type InstanceRegistry, expandBindings, RateLimitStore, InMemoryRateLimitStore, RedisRateLimitStore } from '@codm/core-typescript'
import { UserRepository } from './repositories/UserRepository/UserRepository'
import { DrizzleUserRepository } from './repositories/UserRepository/DrizzleUserRepository'
import { MockUserRepository } from './repositories/UserRepository/MockUserRepository'
import { AccountRepository } from './repositories/AccountRepository/AccountRepository'
import { UserProfileRepository, DrizzleUserProfileRepository, MockUserProfileRepository } from './repositories/UserProfileRepository'
import { DrizzleAccountRepository } from './repositories/AccountRepository/DrizzleAccountRepository'
import { MockAccountRepository } from './repositories/AccountRepository/MockAccountRepository'
import { BetterAuth } from './services/Authentication'

export const INSTANCE_REGISTRY: InstanceRegistry = expandBindings([
	{ token: UserRepository, mock: MockUserRepository, real: DrizzleUserRepository },
	{ token: AccountRepository, mock: MockAccountRepository, real: DrizzleAccountRepository },
	{ token: UserProfileRepository, mock: MockUserProfileRepository, real: DrizzleUserProfileRepository },
	// better-auth touches real identity tables and needs GITHUB/GOOGLE credentials to be meaningful —
	// declared absent in mock (flow tests never boot the cloud profile); integration/real self-bind
	// the concrete service (same self-token pattern as the pre-collapse IdentityAuthHooks).
	{ token: BetterAuth, mock: null, real: BetterAuth },
	// In-memory limiter everywhere except production, which needs the shared Redis window.
	{ token: RateLimitStore, mock: InMemoryRateLimitStore, integration: InMemoryRateLimitStore, real: RedisRateLimitStore },
])
