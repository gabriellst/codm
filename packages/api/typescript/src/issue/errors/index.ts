import { HttpStatusCode, registerErrorCodes } from '@codm/core-typescript'
import type { BaseDomainErrors, BaseApplicationErrors, BaseInterfaceErrors, BaseInfrastructureErrors } from '@codm/core-typescript'

// Domain errors — Issue aggregate invariants.
export type IssueDomainErrors =
	| 'ISSUE_ARCHIVED'
	| 'ISSUE_NOT_ARCHIVED'
	| 'ISSUE_ALREADY_ARCHIVED'
	| 'ISSUE_ALREADY_COMPLETED'
	| 'ISSUE_NOT_COMPLETED'
export type DomainErrors = BaseDomainErrors | IssueDomainErrors

// Application errors — orchestration in the issue use cases. The stop control plane left in B4 (spec
// decision 4): STOP_NOT_FOUND / STOP_CRITERION_DISABLED / RESOLUTION_NOT_APPLICABLE are registered by
// `thread/errors` now, next to the use cases and the aggregate that raise them.
export type IssueApplicationErrors = 'ISSUE_NOT_FOUND'
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
	ISSUE_NOT_COMPLETED: HttpStatusCode.UNPROCESSABLE_ENTITY,
	ISSUE_NOT_FOUND: HttpStatusCode.NOT_FOUND,
})
