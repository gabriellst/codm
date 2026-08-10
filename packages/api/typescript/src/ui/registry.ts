// Per-env DI bindings for UI (BFF) BC.
import './errors' // Side-effect: registers context error codes with the framework runtime registry.

import { type InstanceRegistry, expandBindings } from '@codm/core-typescript'
import { ContactAvatarStore, DiskContactAvatarStore, MockContactAvatarStore } from './services/ContactAvatarStore'
import { OnboardingRepository, DrizzleOnboardingRepository, MockOnboardingRepository } from './repositories/OnboardingRepository'

export const INSTANCE_REGISTRY: InstanceRegistry = expandBindings([
	// The BFF context's ONE seam that opens a socket: contact photos live behind a signed CDN url that
	// only the daemon may fetch (CSP + an expiring signature — see ContactAvatarStore). Bound to the
	// double outside `real` so no test depends on a CDN being up or on a writable data dir, the same
	// operational rule `ChannelSender` and `CloudSession` follow.
	{ token: ContactAvatarStore, mock: MockContactAvatarStore, integration: MockContactAvatarStore, real: DiskContactAvatarStore },
	{ token: OnboardingRepository, mock: MockOnboardingRepository, real: DrizzleOnboardingRepository },
])
