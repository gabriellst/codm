import { HttpStatusCode, registerErrorCodes } from '@codm/core-typescript'
import type { BaseDomainErrors, BaseApplicationErrors, BaseInterfaceErrors, BaseInfrastructureErrors } from '@codm/core-typescript'

export type ArtifactDomainErrors = never
export type DomainErrors = BaseDomainErrors | ArtifactDomainErrors

// THREAD_NOT_FOUND / ISSUE_NOT_FOUND are shared codes (owned by thread / issue) — re-registered here
// with the same status for per-file union↔registration parity (registerErrorCodes is idempotent).
//
// ARTIFACT_NOT_FOUND is this context's own, and it deliberately answers FOUR conditions with one
// code (see GetArtifactContent): unknown id, another owner's, another thread's, and a ref whose file
// is gone. ARTIFACT_NOT_PREVIEWABLE is the one genuinely different answer — the artifact IS yours
// and IS there, it just has no local bytes to serve (LINK).
export type ArtifactApplicationErrors = 'THREAD_NOT_FOUND' | 'ISSUE_NOT_FOUND' | 'ARTIFACT_NOT_FOUND' | 'ARTIFACT_NOT_PREVIEWABLE'
export type ApplicationErrors = BaseApplicationErrors | ArtifactApplicationErrors

export type ArtifactInterfaceErrors = never
export type InterfaceErrors = BaseInterfaceErrors | ArtifactInterfaceErrors

export type ArtifactInfrastructureErrors = never
export type InfrastructureErrors = BaseInfrastructureErrors | ArtifactInfrastructureErrors

export type Errors = ApplicationErrors | DomainErrors | InfrastructureErrors | InterfaceErrors

registerErrorCodes({
	THREAD_NOT_FOUND: HttpStatusCode.NOT_FOUND,
	ISSUE_NOT_FOUND: HttpStatusCode.NOT_FOUND,
	ARTIFACT_NOT_FOUND: HttpStatusCode.NOT_FOUND,
	ARTIFACT_NOT_PREVIEWABLE: HttpStatusCode.BAD_REQUEST,
})
