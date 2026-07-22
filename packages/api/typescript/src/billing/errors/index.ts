import { HttpStatusCode, registerErrorCodes } from '@template/core-typescript'
import type { BaseDomainErrors, BaseApplicationErrors, BaseInterfaceErrors, BaseInfrastructureErrors } from '@template/core-typescript'

// Domain Errors (invariant violations raised by billing aggregates/VOs).
export type BillingDomainErrors =
	| 'INVALID_MANDATE'
	| 'FREE_PLAN_NOT_SUBSCRIBABLE'
	| 'INVALID_CHARGE_TRANSITION'
	| 'INVOICE_LINES_MISMATCH'
	| 'PAYMENT_METHOD_OWNER_ID_REQUIRED'
	| 'INVALID_PAYMENT_METHOD_TRANSITION'
	| 'PAYMENT_METHOD_LAST_ACTIVE'
	| 'PAYMENT_METHOD_IS_DEFAULT'
	| 'PAYMENT_METHOD_REQUIRED'
	| 'PAYMENT_METHOD_UNSUPPORTED'
	| 'SUBSCRIPTION_PENDING_CANCELLATION'
	| 'SUBSCRIPTION_NOT_SCHEDULED_FOR_CANCELLATION'
	| 'SUBSCRIPTION_ALREADY_FINALIZED'
	| 'CHECKOUT_SESSION_REF_REQUIRED'
	| 'INVALID_CHECKOUT_SESSION_TRANSITION'
	| 'DISPUTE_REF_REQUIRED'
	| 'INVALID_DISPUTE_TRANSITION'
export type DomainErrors = BaseDomainErrors | BillingDomainErrors

// Application Errors (orchestration conditions in use cases/handlers).
export type BillingApplicationErrors =
	| 'INVOICE_ALREADY_PAID'
	| 'PAYMENT_METHOD_NOT_FOUND'
	| 'PLAN_NOT_FOUND'
	| 'SUBSCRIPTION_ALREADY_EXISTS'
	| 'SUBSCRIPTION_NOT_FOUND'
export type ApplicationErrors = BaseApplicationErrors | BillingApplicationErrors

// Interface Errors (HTTP/webhook boundary + provider port).
export type BillingInterfaceErrors =
	| 'WEBHOOK_SIGNATURE_INVALID'
	| 'WEBHOOK_SOURCE_UNKNOWN'
	| 'PROVIDER_ERROR'
	| 'PROVIDER_CAPABILITY_UNSUPPORTED'
export type InterfaceErrors = BaseInterfaceErrors | BillingInterfaceErrors

// Infrastructure Errors
export type BillingInfrastructureErrors = never
export type InfrastructureErrors = BaseInfrastructureErrors | BillingInfrastructureErrors

export type Errors = ApplicationErrors | DomainErrors | InfrastructureErrors | InterfaceErrors

registerErrorCodes({
	// Domain — invariant violations → 422 (semantically valid request, business rule refuses it),
	// except pure input-shape guards → 400.
	INVALID_MANDATE: HttpStatusCode.UNPROCESSABLE_ENTITY,
	FREE_PLAN_NOT_SUBSCRIBABLE: HttpStatusCode.UNPROCESSABLE_ENTITY,
	INVALID_CHARGE_TRANSITION: HttpStatusCode.UNPROCESSABLE_ENTITY,
	INVOICE_LINES_MISMATCH: HttpStatusCode.UNPROCESSABLE_ENTITY,
	PAYMENT_METHOD_OWNER_ID_REQUIRED: HttpStatusCode.BAD_REQUEST,
	INVALID_PAYMENT_METHOD_TRANSITION: HttpStatusCode.UNPROCESSABLE_ENTITY,
	PAYMENT_METHOD_LAST_ACTIVE: HttpStatusCode.UNPROCESSABLE_ENTITY,
	PAYMENT_METHOD_IS_DEFAULT: HttpStatusCode.UNPROCESSABLE_ENTITY,
	PAYMENT_METHOD_REQUIRED: HttpStatusCode.UNPROCESSABLE_ENTITY,
	PAYMENT_METHOD_UNSUPPORTED: HttpStatusCode.UNPROCESSABLE_ENTITY,
	SUBSCRIPTION_PENDING_CANCELLATION: HttpStatusCode.UNPROCESSABLE_ENTITY,
	SUBSCRIPTION_NOT_SCHEDULED_FOR_CANCELLATION: HttpStatusCode.UNPROCESSABLE_ENTITY,
	SUBSCRIPTION_ALREADY_FINALIZED: HttpStatusCode.UNPROCESSABLE_ENTITY,
	CHECKOUT_SESSION_REF_REQUIRED: HttpStatusCode.BAD_REQUEST,
	INVALID_CHECKOUT_SESSION_TRANSITION: HttpStatusCode.UNPROCESSABLE_ENTITY,
	DISPUTE_REF_REQUIRED: HttpStatusCode.BAD_REQUEST,
	INVALID_DISPUTE_TRANSITION: HttpStatusCode.UNPROCESSABLE_ENTITY,
	// Application
	INVOICE_ALREADY_PAID: HttpStatusCode.UNPROCESSABLE_ENTITY,
	PAYMENT_METHOD_NOT_FOUND: HttpStatusCode.NOT_FOUND,
	PLAN_NOT_FOUND: HttpStatusCode.NOT_FOUND,
	SUBSCRIPTION_ALREADY_EXISTS: HttpStatusCode.CONFLICT,
	SUBSCRIPTION_NOT_FOUND: HttpStatusCode.NOT_FOUND,
	// Interface
	WEBHOOK_SIGNATURE_INVALID: HttpStatusCode.UNAUTHORIZED,
	WEBHOOK_SOURCE_UNKNOWN: HttpStatusCode.BAD_REQUEST,
	PROVIDER_ERROR: HttpStatusCode.BAD_GATEWAY,
	PROVIDER_CAPABILITY_UNSUPPORTED: HttpStatusCode.NOT_IMPLEMENTED,
})
