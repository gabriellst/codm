// Per-env DI bindings for UI (BFF) BC.
import './errors' // Side-effect: registers context error codes with the framework runtime registry.

import { type InstanceRegistry, expandBindings } from '@codm/core-typescript'
import { ContactAvatarStore, DiskContactAvatarStore, MockContactAvatarStore } from './services/ContactAvatarStore'
import { OnboardingRepository, DrizzleOnboardingRepository, MockOnboardingRepository } from './repositories/OnboardingRepository'

export const INSTANCE_REGISTRY: InstanceRegistry = expandBindings([
	// The BFF context's ONE seam that opens a socket: contact photos live behind a signed CDN url that
	// only the daemon may fetch (CSP + an expiring signature — see ContactAvatarStore). Bound to the
	// double outside `real` so no test depends on a CDN being up, the same operational rule
	// `ChannelSender` follows. `e2e` INHERITS the double ON PURPOSE (no declaration needed) — the
	// Playwright harness is a test and must not reach a signed CDN url; the pre-front raw-flag world
	// bound the disk store there only because the flag never touched this token.
	{ token: ContactAvatarStore, mock: MockContactAvatarStore, integration: MockContactAvatarStore, real: DiskContactAvatarStore },
	{ token: OnboardingRepository, mock: MockOnboardingRepository, real: DrizzleOnboardingRepository },
])
