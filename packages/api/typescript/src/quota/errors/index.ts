import { HttpStatusCode, registerErrorCodes } from '@template/core-typescript'
import type { BaseDomainErrors, BaseApplicationErrors, BaseInterfaceErrors, BaseInfrastructureErrors } from '@template/core-typescript'

// Quota error vocabulary (medscall@f04e8a0f port). Registered with the framework runtime registry
// at module load (side-effect import from registry.ts), mirroring billing/errors/index.ts.

// Domain Errors (invariant violations raised by quota services/guards).
export type QuotaDomainErrors =
	// Raised by QuotaGate when a hard-limit key is at/over its effective limit.
	| 'QUOTA_LIMIT_EXCEEDED'
	// Over-quota plan lock — raised when a locked resource/actor (grandfathered then locked by a
	// downgrade) is used. Owned here (not @billing) so the shared/quota-facing authorization guard
	// can raise it without importing billing.
	| 'RESOURCE_LOCKED_BY_PLAN'
export type DomainErrors = BaseDomainErrors | QuotaDomainErrors

// Application Errors (orchestration conditions in use cases).
export type QuotaApplicationErrors =
	// RequestDowngrade — a kept id isn't owned by the owner, is the owner's own seat, the keep-count
	// for a key exceeds the target plan's limit, or the target plan is FREE (→FREE goes through
	// cancellation, not downgrade).
	'DOWNGRADE_SELECTION_INVALID'
export type ApplicationErrors = BaseApplicationErrors | QuotaApplicationErrors

// Interface Errors
export type QuotaInterfaceErrors = never
export type InterfaceErrors = BaseInterfaceErrors | QuotaInterfaceErrors

// Infrastructure Errors
export type QuotaInfrastructureErrors = never
export type InfrastructureErrors = BaseInfrastructureErrors | QuotaInfrastructureErrors

export type Errors = ApplicationErrors | DomainErrors | InfrastructureErrors | InterfaceErrors

registerErrorCodes({
	// Domain — a valid request refused on quota grounds → 403 (the actor may not perform this now).
	QUOTA_LIMIT_EXCEEDED: HttpStatusCode.FORBIDDEN,
	RESOURCE_LOCKED_BY_PLAN: HttpStatusCode.FORBIDDEN,
	// Application — an ill-formed downgrade selection → 422 (semantically valid, business rule refuses).
	DOWNGRADE_SELECTION_INVALID: HttpStatusCode.UNPROCESSABLE_ENTITY,
})
