import { HttpStatusCode, registerErrorCodes } from '@codm/core-typescript'
import type { BaseDomainErrors, BaseApplicationErrors, BaseInterfaceErrors, BaseInfrastructureErrors } from '@codm/core-typescript'

export type PanelDomainErrors = never
export type DomainErrors = BaseDomainErrors | PanelDomainErrors

/**
 * PANEL_NOT_FOUND covers an unknown token, an issue of another group and a group of another owner alike
 * — a link must not tell its holder whether something exists elsewhere.
 */
export type PanelApplicationErrors =
	| 'PANEL_NOT_FOUND'
	/** The member picked is not on the group's current roster (left, unnamed, or never existed). */
	| 'PANEL_MEMBER_NOT_FOUND'
	/** Too many code requests for this member — 1 per minute, 5 per hour. */
	| 'PANEL_CODE_RATE_LIMITED'
	/** Wrong code, or no code delivered yet for this member. */
	| 'PANEL_CODE_INVALID'
	/** The code ran out its 10 minutes or was already used. */
	| 'PANEL_CODE_EXPIRED'
	/** Five wrong tries on this code — ask for a new one. */
	| 'PANEL_CODE_ATTEMPTS_EXCEEDED'
export type ApplicationErrors = BaseApplicationErrors | PanelApplicationErrors

export type PanelInterfaceErrors = never
export type InterfaceErrors = BaseInterfaceErrors | PanelInterfaceErrors

export type PanelInfrastructureErrors = never
export type InfrastructureErrors = BaseInfrastructureErrors | PanelInfrastructureErrors

export type Errors = ApplicationErrors | DomainErrors | InfrastructureErrors | InterfaceErrors

registerErrorCodes({
	PANEL_NOT_FOUND: HttpStatusCode.NOT_FOUND,
	PANEL_MEMBER_NOT_FOUND: HttpStatusCode.NOT_FOUND,
	PANEL_CODE_RATE_LIMITED: HttpStatusCode.TOO_MANY_REQUESTS,
	PANEL_CODE_INVALID: HttpStatusCode.BAD_REQUEST,
	PANEL_CODE_EXPIRED: HttpStatusCode.GONE,
	PANEL_CODE_ATTEMPTS_EXCEEDED: HttpStatusCode.TOO_MANY_REQUESTS,
})
