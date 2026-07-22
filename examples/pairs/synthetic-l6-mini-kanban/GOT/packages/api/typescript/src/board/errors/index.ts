import { HttpStatusCode, registerErrorCodes } from '@template/core-typescript'
import type { BaseDomainErrors, BaseApplicationErrors, BaseInterfaceErrors, BaseInfrastructureErrors } from '@template/core-typescript'

export type BoardDomainErrors = 'BOARD_TITLE_EMPTY'
export type DomainErrors = BaseDomainErrors | BoardDomainErrors

export type BoardApplicationErrors =
	| 'BOARD_NOT_FOUND'
	| 'BOARD_ALREADY_ARCHIVED'
	| 'BOARD_LIST_NOT_FOUND'
export type ApplicationErrors = BaseApplicationErrors | BoardApplicationErrors

export type BoardInfrastructureErrors = never
export type InfrastructureErrors = BaseInfrastructureErrors | BoardInfrastructureErrors

export type BoardInterfaceErrors = never
export type InterfaceErrors = BaseInterfaceErrors | BoardInterfaceErrors

export type BoardErrors = BoardDomainErrors | BoardApplicationErrors

export type Errors = ApplicationErrors | DomainErrors | InfrastructureErrors | InterfaceErrors

registerErrorCodes({
	BOARD_NOT_FOUND: HttpStatusCode.NOT_FOUND,
	BOARD_ALREADY_ARCHIVED: HttpStatusCode.CONFLICT,
	BOARD_TITLE_EMPTY: HttpStatusCode.UNPROCESSABLE_ENTITY,
	BOARD_LIST_NOT_FOUND: HttpStatusCode.NOT_FOUND,
})
