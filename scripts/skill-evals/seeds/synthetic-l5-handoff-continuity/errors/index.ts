import { HttpStatusCode, registerErrorCodes } from '@codm/core-typescript'
import type { BaseDomainErrors, BaseApplicationErrors, BaseInterfaceErrors, BaseInfrastructureErrors } from '@codm/core-typescript'

export type SalesDomainErrors =
	| 'INVALID_ORDER_OVERRIDE_FIELDS'
	| 'MIXED_CURRENCY_PRODUCT_COST'
	| 'COUPON_CODE_REQUIRED'
	| 'INVALID_COUPON_CODE'
	| 'INVALID_COUPON_VALUE'
	| 'COUPON_EXPIRY_IN_PAST'
	| 'COUPON_EXPIRED'
	| 'COUPON_ALREADY_INACTIVE'
export type DomainErrors = BaseDomainErrors | SalesDomainErrors

export type SalesApplicationErrors = 'ORDER_NOT_FOUND' | 'INVALID_LINE_ID' | 'COUPON_NOT_FOUND' | 'COUPON_CODE_ALREADY_EXISTS'
export type ApplicationErrors = BaseApplicationErrors | SalesApplicationErrors

export type InterfaceErrors = BaseInterfaceErrors
export type InfrastructureErrors = BaseInfrastructureErrors
export type Errors = ApplicationErrors | DomainErrors | InfrastructureErrors | InterfaceErrors

registerErrorCodes({
	INVALID_ORDER_OVERRIDE_FIELDS: HttpStatusCode.UNPROCESSABLE_ENTITY,
	MIXED_CURRENCY_PRODUCT_COST: HttpStatusCode.UNPROCESSABLE_ENTITY,
	ORDER_NOT_FOUND: HttpStatusCode.NOT_FOUND,
	INVALID_LINE_ID: HttpStatusCode.UNPROCESSABLE_ENTITY,
	COUPON_CODE_REQUIRED: HttpStatusCode.UNPROCESSABLE_ENTITY,
	INVALID_COUPON_CODE: HttpStatusCode.UNPROCESSABLE_ENTITY,
	INVALID_COUPON_VALUE: HttpStatusCode.UNPROCESSABLE_ENTITY,
	COUPON_EXPIRY_IN_PAST: HttpStatusCode.UNPROCESSABLE_ENTITY,
	COUPON_EXPIRED: HttpStatusCode.CONFLICT,
	COUPON_ALREADY_INACTIVE: HttpStatusCode.CONFLICT,
	COUPON_CODE_ALREADY_EXISTS: HttpStatusCode.CONFLICT,
	COUPON_NOT_FOUND: HttpStatusCode.NOT_FOUND,
})
