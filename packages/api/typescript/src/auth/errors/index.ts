import { HttpStatusCode, registerErrorCodes } from '@codm/core-typescript'
import type { BaseDomainErrors, BaseApplicationErrors, BaseInterfaceErrors, BaseInfrastructureErrors } from '@codm/core-typescript'

// The auth context owns the whole user surface since the identity collapse: BetterAuth identity +
// the supplementary UserProfile aggregate. Former identity error codes live here now.
//
// DEVICE_TOKEN_INVALID is deliberately a member of BOTH unions below (SP2 T2). `DeviceToken.revoke()`
// throws it as a DOMAIN error (idempotent-refuse: revoking an already-revoked token is an aggregate
// invariant). GetEntitlement/RevokeDevice throw the SAME code as an APPLICATION error when a bearer
// token's hash resolves to no live row at all. One HTTP-facing code either way — the caller can never
// tell "never existed" from "already revoked" apart, by design (same posture as artifact's
// ARTIFACT_NOT_FOUND folding four causes into one code).
export type AuthDomainErrors =
	| 'WEAK_PASSWORD'
	| 'INVALID_EMAIL_FORMAT'
	| 'INVALID_PHONE'
	| 'INVALID_EMAIL'
	| 'PASSWORD_TOO_WEAK'
	| 'INVALID_TIMEZONE'
	| 'INVALID_LANGUAGE'
	| 'INVALID_PICTURE_URL'
	| 'DEVICE_TOKEN_INVALID'
export type DomainErrors = BaseDomainErrors | AuthDomainErrors

export type AuthApplicationErrors =
	| 'USER_NOT_FOUND'
	| 'EMAIL_ALREADY_REGISTERED'
	| 'INVALID_AUTH_TOKEN'
	| 'INVALIDATED_AUTH_TOKEN'
	| 'DEVICE_CODE_INVALID'
	| 'DEVICE_TOKEN_INVALID'
export type ApplicationErrors = BaseApplicationErrors | AuthApplicationErrors

export type AuthInterfaceErrors = 'PASSWORDS_DONT_MATCH'
export type InterfaceErrors = BaseInterfaceErrors | AuthInterfaceErrors

export type AuthInfrastructureErrors = never
export type InfrastructureErrors = BaseInfrastructureErrors | AuthInfrastructureErrors

export type Errors = ApplicationErrors | DomainErrors | InfrastructureErrors | InterfaceErrors

// Side-effect import: register this context's error codes with the framework
// runtime registry. Mirrors Go's RegisterErrorCodes() pattern in init().
registerErrorCodes({
	WEAK_PASSWORD: HttpStatusCode.BAD_REQUEST,
	INVALID_EMAIL_FORMAT: HttpStatusCode.BAD_REQUEST,
	INVALID_PHONE: HttpStatusCode.BAD_REQUEST,
	USER_NOT_FOUND: HttpStatusCode.NOT_FOUND,
	EMAIL_ALREADY_REGISTERED: HttpStatusCode.CONFLICT,
	INVALID_AUTH_TOKEN: HttpStatusCode.UNAUTHORIZED,
	INVALIDATED_AUTH_TOKEN: HttpStatusCode.UNAUTHORIZED,
	PASSWORDS_DONT_MATCH: HttpStatusCode.BAD_REQUEST,
	INVALID_EMAIL: HttpStatusCode.BAD_REQUEST,
	PASSWORD_TOO_WEAK: HttpStatusCode.BAD_REQUEST,
	INVALID_TIMEZONE: HttpStatusCode.BAD_REQUEST,
	INVALID_LANGUAGE: HttpStatusCode.BAD_REQUEST,
	INVALID_PICTURE_URL: HttpStatusCode.BAD_REQUEST,
	// Device tokens (SP2 T2) — both answer 401: the caller's credential (code or bearer token)
	// didn't work, and neither leaks WHY.
	DEVICE_CODE_INVALID: HttpStatusCode.UNAUTHORIZED,
	DEVICE_TOKEN_INVALID: HttpStatusCode.UNAUTHORIZED,
})
