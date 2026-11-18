import { HttpStatusCode, registerErrorCodes } from '@codm/core-typescript'
import type { BaseDomainErrors, BaseApplicationErrors, BaseInterfaceErrors, BaseInfrastructureErrors } from '@codm/core-typescript'

// Domain errors — Issue aggregate invariants.
export type IssueDomainErrors =
	| 'ISSUE_ARCHIVED'
	| 'ISSUE_NOT_ARCHIVED'
	| 'ISSUE_ALREADY_ARCHIVED'
	| 'ISSUE_ALREADY_COMPLETED'
	| 'ISSUE_NOT_COMPLETED'
	| 'ISSUE_NOT_REOPENABLE'
	// Pausa como comando (fase 2, item 2): só trabalho que ainda anda pode ser segurado, e só o que está
	// segurado pode continuar.
	| 'ISSUE_NOT_PAUSABLE'
	| 'ISSUE_ALREADY_PAUSED'
	| 'ISSUE_NOT_PAUSED'
export type DomainErrors = BaseDomainErrors | IssueDomainErrors

// Application errors — orchestration in the issue use cases. The stop control plane left in B4 (spec
// decision 4): STOP_NOT_FOUND / STOP_CRITERION_DISABLED / RESOLUTION_NOT_APPLICABLE are registered by
// `thread/errors` now, next to the use cases and the aggregate that raise them.
// ISSUE_PAUSED: an external tool (SendDirectMessage, SendArtifact, RaiseStop, AskOperator) was called by
// the run of an issue that is held — itself paused, or its whole conversation paused (`IssueHold`).
export type IssueApplicationErrors = 'ISSUE_NOT_FOUND' | 'PANEL_LINK_UNAVAILABLE' | 'ISSUE_PAUSED'
export type ApplicationErrors = BaseApplicationErrors | IssueApplicationErrors

export type IssueInterfaceErrors = never
export type InterfaceErrors = BaseInterfaceErrors | IssueInterfaceErrors

export type IssueInfrastructureErrors = never
export type InfrastructureErrors = BaseInfrastructureErrors | IssueInfrastructureErrors

export type Errors = ApplicationErrors | DomainErrors | InfrastructureErrors | InterfaceErrors

registerErrorCodes({
	// The conversation has no panel link yet (never pushed) or this install is not logged in to the cloud.
	PANEL_LINK_UNAVAILABLE: HttpStatusCode.CONFLICT,
	ISSUE_ARCHIVED: HttpStatusCode.UNPROCESSABLE_ENTITY,
	ISSUE_NOT_ARCHIVED: HttpStatusCode.UNPROCESSABLE_ENTITY,
	ISSUE_ALREADY_ARCHIVED: HttpStatusCode.UNPROCESSABLE_ENTITY,
	ISSUE_ALREADY_COMPLETED: HttpStatusCode.UNPROCESSABLE_ENTITY,
	ISSUE_NOT_COMPLETED: HttpStatusCode.UNPROCESSABLE_ENTITY,
	ISSUE_NOT_REOPENABLE: HttpStatusCode.UNPROCESSABLE_ENTITY,
	ISSUE_NOT_PAUSABLE: HttpStatusCode.UNPROCESSABLE_ENTITY,
	ISSUE_ALREADY_PAUSED: HttpStatusCode.UNPROCESSABLE_ENTITY,
	ISSUE_NOT_PAUSED: HttpStatusCode.UNPROCESSABLE_ENTITY,
	// CONFLICT: the call is well-formed and authorized; the issue's current state (held) is what refuses it.
	ISSUE_PAUSED: HttpStatusCode.CONFLICT,
	ISSUE_NOT_FOUND: HttpStatusCode.NOT_FOUND,
})
