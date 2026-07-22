import { HttpStatusCode, registerErrorCodes } from '@codedm/core-typescript'
import type { BaseDomainErrors, BaseApplicationErrors, BaseInterfaceErrors, BaseInfrastructureErrors } from '@codedm/core-typescript'

// ─── Domain Errors ────────────────────────────────────────────────────────────

export type WorkspaceDomainErrors = never

export type DomainErrors = BaseDomainErrors | WorkspaceDomainErrors

// ─── Application Errors ───────────────────────────────────────────────────────

export type WorkspaceApplicationErrors = 'WORKSPACE_NOT_FOUND'

export type ApplicationErrors = BaseApplicationErrors | WorkspaceApplicationErrors

// ─── Interface / Infrastructure Errors ───────────────────────────────────────

export type WorkspaceInterfaceErrors = never
export type InterfaceErrors = BaseInterfaceErrors | WorkspaceInterfaceErrors

export type WorkspaceInfrastructureErrors = never
export type InfrastructureErrors = BaseInfrastructureErrors | WorkspaceInfrastructureErrors

export type Errors = ApplicationErrors | DomainErrors | InfrastructureErrors | InterfaceErrors

// ─── HTTP Status Registration ─────────────────────────────────────────────────

registerErrorCodes({
	WORKSPACE_NOT_FOUND: HttpStatusCode.NOT_FOUND,
})
