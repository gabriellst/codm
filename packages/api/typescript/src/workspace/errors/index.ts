import { HttpStatusCode, registerErrorCodes } from '@codm/core-typescript'
import type { BaseDomainErrors, BaseApplicationErrors, BaseInterfaceErrors, BaseInfrastructureErrors } from '@codm/core-typescript'

// BC2 Workspace Registry has no in-aggregate invariant beyond schema validation.
export type WorkspaceDomainErrors = never
export type DomainErrors = BaseDomainErrors | WorkspaceDomainErrors

// Application errors (orchestration in AddWorkspace / RemoveWorkspace).
export type WorkspaceApplicationErrors =
	| 'PATH_NOT_FOUND'
	| 'PATH_NOT_A_DIRECTORY'
	| 'WORKSPACE_ALREADY_REGISTERED'
	| 'WORKSPACE_NOT_FOUND'
	| 'WORKSPACE_IN_USE'
export type ApplicationErrors = BaseApplicationErrors | WorkspaceApplicationErrors

export type WorkspaceInterfaceErrors = never
export type InterfaceErrors = BaseInterfaceErrors | WorkspaceInterfaceErrors

export type WorkspaceInfrastructureErrors = never
export type InfrastructureErrors = BaseInfrastructureErrors | WorkspaceInfrastructureErrors

export type Errors = ApplicationErrors | DomainErrors | InfrastructureErrors | InterfaceErrors

registerErrorCodes({
	PATH_NOT_FOUND: HttpStatusCode.BAD_REQUEST,
	PATH_NOT_A_DIRECTORY: HttpStatusCode.BAD_REQUEST,
	WORKSPACE_ALREADY_REGISTERED: HttpStatusCode.CONFLICT,
	WORKSPACE_NOT_FOUND: HttpStatusCode.NOT_FOUND,
	// An issue with status WORKING runs on this workspace — removal is refused.
	WORKSPACE_IN_USE: HttpStatusCode.UNPROCESSABLE_ENTITY,
})
