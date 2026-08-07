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
import { DeviceTokenRepository, DrizzleDeviceTokenRepository, MockDeviceTokenRepository } from './repositories/DeviceTokenRepository'
import { BetterAuth } from './services/Authentication'
import { CloudSession, FileCloudSession, MockCloudSession } from './services/CloudSession'

export const INSTANCE_REGISTRY: InstanceRegistry = expandBindings([
	{ token: UserRepository, mock: MockUserRepository, real: DrizzleUserRepository },
	{ token: AccountRepository, mock: MockAccountRepository, real: DrizzleAccountRepository },
	{ token: UserProfileRepository, mock: MockUserProfileRepository, real: DrizzleUserProfileRepository },
	{ token: DeviceTokenRepository, mock: MockDeviceTokenRepository, real: DrizzleDeviceTokenRepository },
	// better-auth touches real identity tables and needs GITHUB/GOOGLE credentials to be meaningful —
	// declared absent in mock (flow tests never boot the cloud profile); integration/real self-bind
	// the concrete service (same self-token pattern as the pre-collapse IdentityAuthHooks).
	{ token: BetterAuth, mock: null, real: BetterAuth },
	// The LOCAL daemon's login gate (SP2 T7) — the mirror image of BetterAuth above: bound `real`
	// EVERYWHERE (the daemon profile always has one, unlike the cloud-only BetterAuth), by CLASS
	// REFERENCE rather than `useFactory` so it stays a true singleton — see FileCloudSession's
	// docblock for why that specific property matters here.
	{ token: CloudSession, mock: MockCloudSession, integration: MockCloudSession, real: FileCloudSession },
	// In-memory limiter everywhere except production, which needs the shared Redis window.
	{ token: RateLimitStore, mock: InMemoryRateLimitStore, integration: InMemoryRateLimitStore, real: RedisRateLimitStore },
])
