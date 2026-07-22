import { HttpStatusCode, registerErrorCodes } from '@codedm/core-typescript'
import type { BaseDomainErrors, BaseApplicationErrors, BaseInterfaceErrors, BaseInfrastructureErrors } from '@codedm/core-typescript'

export type ProcurementDomainErrors = 'PURCHASE_ORDER_ALREADY_CANCELLED' | 'PURCHASE_ORDER_ALREADY_PLACED'
export type DomainErrors = BaseDomainErrors | ProcurementDomainErrors

export type ProcurementApplicationErrors = 'PURCHASE_ORDER_NOT_FOUND'
export type ApplicationErrors = BaseApplicationErrors | ProcurementApplicationErrors

export type ProcurementInfrastructureErrors = never
export type InfrastructureErrors = BaseInfrastructureErrors | ProcurementInfrastructureErrors

export type ProcurementInterfaceErrors = never
export type InterfaceErrors = BaseInterfaceErrors | ProcurementInterfaceErrors

export type Errors = ApplicationErrors | DomainErrors | InfrastructureErrors | InterfaceErrors

registerErrorCodes({
	// Domain
	PURCHASE_ORDER_ALREADY_CANCELLED: HttpStatusCode.UNPROCESSABLE_ENTITY,
	PURCHASE_ORDER_ALREADY_PLACED: HttpStatusCode.UNPROCESSABLE_ENTITY,
	// Application
	PURCHASE_ORDER_NOT_FOUND: HttpStatusCode.NOT_FOUND,
})
