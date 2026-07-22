// Per-env DI bindings for the quota BC (medscall@f04e8a0f port).
import './errors' // Side-effect: registers context error codes with the framework runtime registry.

import { type InstanceRegistry, expandBindings } from '@template/core-typescript'
import {
	QuotaGate,
	QuotaUsageSource,
	DefaultQuotaUsageSource,
	ResourceGovernorRegistry,
	DefaultResourceGovernorRegistry,
	ResourceLimitEnforcer,
	QuotaEntitlement,
	DrizzleQuotaEntitlement,
	MockQuotaEntitlement,
} from './services'
import {
	PendingSelectionRepository,
	MockPendingSelectionRepository,
	DrizzlePendingSelectionRepository,
	QuotaOverrideRepository,
	DrizzleQuotaOverrideRepository,
	MockQuotaOverrideRepository,
} from './repositories'

// QuotaUsageSource is bound here to an EMPTY DefaultQuotaUsageSource (no counters → `usage` always
// resolves 0) so this context's own container/smoke tests resolve in isolation. The real
// cross-context counters map only exists at the shared merge root (the composition root that
// legitimately knows every context's counters) — @shared/registry overrides this binding there.
const placeholderUsageSource = { useFactory: () => new DefaultQuotaUsageSource({}) }

// Same pattern for ResourceGovernorRegistry — bound here to an EMPTY DefaultResourceGovernorRegistry
// (no governors → `keys` is empty, so the enforcer loop is a no-op) so this context resolves in
// isolation. A downstream product's merge root overrides this with its real per-key governors map.
const placeholderGovernorRegistry = { useFactory: () => new DefaultResourceGovernorRegistry({}) }

export const INSTANCE_REGISTRY: InstanceRegistry = expandBindings([
	{ token: QuotaGate, mock: QuotaGate, real: QuotaGate },
	{ token: QuotaUsageSource, mock: placeholderUsageSource, real: placeholderUsageSource },
	{ token: ResourceGovernorRegistry, mock: placeholderGovernorRegistry, real: placeholderGovernorRegistry },
	{ token: PendingSelectionRepository, mock: MockPendingSelectionRepository, real: DrizzlePendingSelectionRepository },
	{ token: ResourceLimitEnforcer, mock: ResourceLimitEnforcer, real: ResourceLimitEnforcer },
	{ token: QuotaOverrideRepository, mock: MockQuotaOverrideRepository, real: DrizzleQuotaOverrideRepository },
	{ token: QuotaEntitlement, mock: MockQuotaEntitlement, real: DrizzleQuotaEntitlement },
])
