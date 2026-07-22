import { HttpStatusCode, registerErrorCodes } from '@codedm/core-typescript'
import type { BaseDomainErrors, BaseApplicationErrors, BaseInterfaceErrors, BaseInfrastructureErrors } from '@codedm/core-typescript'

export type ArtifactDomainErrors = never
export type DomainErrors = BaseDomainErrors | ArtifactDomainErrors

// THREAD_NOT_FOUND / ISSUE_NOT_FOUND are shared codes (owned by thread / issue) — re-registered here
// with the same status for per-file union↔registration parity (registerErrorCodes is idempotent).
export type ArtifactApplicationErrors = 'THREAD_NOT_FOUND' | 'ISSUE_NOT_FOUND'
export type ApplicationErrors = BaseApplicationErrors | ArtifactApplicationErrors

export type ArtifactInterfaceErrors = never
export type InterfaceErrors = BaseInterfaceErrors | ArtifactInterfaceErrors

export type ArtifactInfrastructureErrors = never
export type InfrastructureErrors = BaseInfrastructureErrors | ArtifactInfrastructureErrors

export type Errors = ApplicationErrors | DomainErrors | InfrastructureErrors | InterfaceErrors

registerErrorCodes({
	THREAD_NOT_FOUND: HttpStatusCode.NOT_FOUND,
	ISSUE_NOT_FOUND: HttpStatusCode.NOT_FOUND,
})
