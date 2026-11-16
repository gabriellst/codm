import { HttpStatusCode, registerErrorCodes } from '@codm/core-typescript'
import type { BaseDomainErrors, BaseApplicationErrors, BaseInterfaceErrors, BaseInfrastructureErrors } from '@codm/core-typescript'

export type PanelDomainErrors = never
export type DomainErrors = BaseDomainErrors | PanelDomainErrors

/**
 * PANEL_NOT_FOUND covers an unknown token, an issue of another group and a group of another owner alike
 * — a link must not tell its holder whether something exists elsewhere.
 */
export type PanelApplicationErrors = 'PANEL_NOT_FOUND'
export type ApplicationErrors = BaseApplicationErrors | PanelApplicationErrors

export type PanelInterfaceErrors = never
export type InterfaceErrors = BaseInterfaceErrors | PanelInterfaceErrors

export type PanelInfrastructureErrors = never
export type InfrastructureErrors = BaseInfrastructureErrors | PanelInfrastructureErrors

export type Errors = ApplicationErrors | DomainErrors | InfrastructureErrors | InterfaceErrors

registerErrorCodes({
	PANEL_NOT_FOUND: HttpStatusCode.NOT_FOUND,
})
