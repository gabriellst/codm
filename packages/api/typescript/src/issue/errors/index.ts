import { HttpStatusCode, registerErrorCodes } from '@template/core-typescript'
import type { BaseDomainErrors, BaseApplicationErrors, BaseInterfaceErrors, BaseInfrastructureErrors } from '@template/core-typescript'

// Domain errors — Issue aggregate invariants.
export type IssueDomainErrors = 'ISSUE_ARCHIVED' | 'ISSUE_NOT_ARCHIVED' | 'ISSUE_ALREADY_ARCHIVED' | 'ISSUE_ALREADY_COMPLETED'
export type DomainErrors = BaseDomainErrors | IssueDomainErrors

// Application errors — orchestration in the issue use cases + stop control plane.
export type IssueApplicationErrors =
	| 'ISSUE_NOT_FOUND'
	| 'STOP_NOT_FOUND'
	| 'STOP_CRITERION_DISABLED'
	| 'RESOLUTION_NOT_APPLICABLE'
export type ApplicationErrors = BaseApplicationErrors | IssueApplicationErrors

export type IssueInterfaceErrors = never
export type InterfaceErrors = BaseInterfaceErrors | IssueInterfaceErrors

export type IssueInfrastructureErrors = never
export type InfrastructureErrors = BaseInfrastructureErrors | IssueInfrastructureErrors

export type Errors = ApplicationErrors | DomainErrors | InfrastructureErrors | InterfaceErrors

registerErrorCodes({
	ISSUE_ARCHIVED: HttpStatusCode.UNPROCESSABLE_ENTITY,
	ISSUE_NOT_ARCHIVED: HttpStatusCode.UNPROCESSABLE_ENTITY,
	ISSUE_ALREADY_ARCHIVED: HttpStatusCode.UNPROCESSABLE_ENTITY,
	ISSUE_ALREADY_COMPLETED: HttpStatusCode.UNPROCESSABLE_ENTITY,
	ISSUE_NOT_FOUND: HttpStatusCode.NOT_FOUND,
	STOP_NOT_FOUND: HttpStatusCode.NOT_FOUND,
	STOP_CRITERION_DISABLED: HttpStatusCode.UNPROCESSABLE_ENTITY,
	RESOLUTION_NOT_APPLICABLE: HttpStatusCode.UNPROCESSABLE_ENTITY,
})
