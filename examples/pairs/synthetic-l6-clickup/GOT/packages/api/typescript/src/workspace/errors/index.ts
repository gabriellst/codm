import { HttpStatusCode, registerErrorCodes } from '@template/core-typescript'
import type { BaseDomainErrors, BaseApplicationErrors, BaseInterfaceErrors, BaseInfrastructureErrors } from '@template/core-typescript'

export type WorkspaceDomainErrors = never
export type DomainErrors = BaseDomainErrors | WorkspaceDomainErrors

export type WorkspaceApplicationErrors = 'WORKSPACE_NOT_FOUND' | 'SPACE_NOT_FOUND'
export type ApplicationErrors = BaseApplicationErrors | WorkspaceApplicationErrors

export type WorkspaceInterfaceErrors = never
export type InterfaceErrors = BaseInterfaceErrors | WorkspaceInterfaceErrors

export type WorkspaceInfrastructureErrors = never
export type InfrastructureErrors = BaseInfrastructureErrors | WorkspaceInfrastructureErrors

export type Errors = ApplicationErrors | DomainErrors | InfrastructureErrors | InterfaceErrors

// Side-effect import: register this context's error codes with the framework
// runtime registry. Mirrors Go's RegisterErrorCodes() pattern in init().
registerErrorCodes({
	WORKSPACE_NOT_FOUND: HttpStatusCode.NOT_FOUND,
	SPACE_NOT_FOUND: HttpStatusCode.NOT_FOUND,
})
