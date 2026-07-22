import { HttpStatusCode, registerErrorCodes } from '@codedm/core-typescript'
import type { BaseDomainErrors, BaseApplicationErrors, BaseInterfaceErrors, BaseInfrastructureErrors } from '@codedm/core-typescript'

// ─── Domain Errors ────────────────────────────────────────────────────────────
// Raised by entities / value objects when a business invariant is violated.

export type PageDomainErrors =
	/** Attempted to add a child block under a block type that is not a container (only TOGGLE may have children). */
	| 'BLOCK_PARENT_NOT_CONTAINER'
	/** The referenced block id does not exist in the page's block tree. */
	| 'BLOCK_NOT_FOUND'

export type DomainErrors = BaseDomainErrors | PageDomainErrors

// ─── Application Errors ───────────────────────────────────────────────────────
// Raised by use cases when orchestration fails (lookup failure, auth, quotas).

export type PageApplicationErrors = 'PAGE_NOT_FOUND'

export type ApplicationErrors = BaseApplicationErrors | PageApplicationErrors

// ─── Interface / Infrastructure Errors ───────────────────────────────────────
export type PageInterfaceErrors = never
export type InterfaceErrors = BaseInterfaceErrors | PageInterfaceErrors

export type PageInfrastructureErrors = never
export type InfrastructureErrors = BaseInfrastructureErrors | PageInfrastructureErrors

export type Errors = ApplicationErrors | DomainErrors | InfrastructureErrors | InterfaceErrors

// ─── HTTP Status Registration ─────────────────────────────────────────────────
registerErrorCodes({
	// Domain
	BLOCK_PARENT_NOT_CONTAINER: HttpStatusCode.BAD_REQUEST,
	BLOCK_NOT_FOUND: HttpStatusCode.NOT_FOUND,
	// Application
	PAGE_NOT_FOUND: HttpStatusCode.NOT_FOUND,
})
