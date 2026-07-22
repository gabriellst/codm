import { HttpStatusCode, registerErrorCodes } from '@template/core-typescript'
import type { BaseDomainErrors, BaseApplicationErrors, BaseInterfaceErrors, BaseInfrastructureErrors } from '@template/core-typescript'

// Domain Errors (invariant violations on the thin Owner aggregate).
export type OwnerDomainErrors = 'INVALID_TIMEZONE' | 'OWNER_ALREADY_DISABLED' | 'OWNER_NOT_DISABLED'
export type DomainErrors = BaseDomainErrors | OwnerDomainErrors

// Application Errors (orchestration in use cases).
export type OwnerApplicationErrors = 'OWNER_NOT_FOUND'
export type ApplicationErrors = BaseApplicationErrors | OwnerApplicationErrors

export type OwnerInterfaceErrors = never
export type InterfaceErrors = BaseInterfaceErrors | OwnerInterfaceErrors

export type OwnerInfrastructureErrors = never
export type InfrastructureErrors = BaseInfrastructureErrors | OwnerInfrastructureErrors

export type Errors = ApplicationErrors | DomainErrors | InfrastructureErrors | InterfaceErrors

registerErrorCodes({
	OWNER_NOT_FOUND: HttpStatusCode.NOT_FOUND,
	OWNER_ALREADY_DISABLED: HttpStatusCode.UNPROCESSABLE_ENTITY,
	OWNER_NOT_DISABLED: HttpStatusCode.UNPROCESSABLE_ENTITY,
	INVALID_TIMEZONE: HttpStatusCode.BAD_REQUEST,
})
