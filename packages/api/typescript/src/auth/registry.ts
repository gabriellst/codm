// Recipe: dev:packages/api/src/auth/registry.ts — per-env bindings for auth context.
// Stripped: no clinic-switching, no doctor/collaborator.
import './errors' // Side-effect: registers this context's error codes with the framework runtime registry.
import {
	type InstanceRegistry,
	expandBindings,
	RateLimitStore,
	InMemoryRateLimitStore,
	RedisRateLimitStore,
} from '@template/core-typescript'
import { UserRepository } from './repositories/UserRepository/UserRepository'
import { DrizzleUserRepository } from './repositories/UserRepository/DrizzleUserRepository'
import { MockUserRepository } from './repositories/UserRepository/MockUserRepository'
import { AccountRepository } from './repositories/AccountRepository/AccountRepository'
import { UserProfileRepository, DrizzleUserProfileRepository, MockUserProfileRepository } from './repositories/UserProfileRepository'
import {
	FcmRegistrationTokenRepository,
	DrizzleFcmRegistrationTokenRepository,
	MockFcmRegistrationTokenRepository,
} from './repositories/FcmRegistrationTokenRepository'
import { DrizzleAccountRepository } from './repositories/AccountRepository/DrizzleAccountRepository'
import { MockAccountRepository } from './repositories/AccountRepository/MockAccountRepository'

export const INSTANCE_REGISTRY: InstanceRegistry = expandBindings([
	{ token: UserRepository, mock: MockUserRepository, real: DrizzleUserRepository },
	{ token: AccountRepository, mock: MockAccountRepository, real: DrizzleAccountRepository },
	{ token: UserProfileRepository, mock: MockUserProfileRepository, real: DrizzleUserProfileRepository },
	{ token: FcmRegistrationTokenRepository, mock: MockFcmRegistrationTokenRepository, real: DrizzleFcmRegistrationTokenRepository },
	// In-memory limiter everywhere except production, which needs the shared Redis window.
	{ token: RateLimitStore, mock: InMemoryRateLimitStore, integration: InMemoryRateLimitStore, real: RedisRateLimitStore },
])
