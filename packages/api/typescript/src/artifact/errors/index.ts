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
//
// The four below are `SendArtifact`'s own ("envio de artefatos pelo canal" design, decision 6 — every
// one checked in the use case BEFORE enqueueing `deliver_channel_attachment`, never discovered by a
// failed command):
//   - ARTIFACT_FILE_MISSING (422) — `ref` no longer names a file on disk. Distinct from
//     ARTIFACT_NOT_FOUND: the ROW is real and yours, only the bytes are gone — same distinction
//     ARTIFACT_NOT_PREVIEWABLE draws for LINK, the opposite direction (bytes never existed vs. bytes
//     existed and are gone).
//   - ARTIFACT_TOO_LARGE (413) — over its kind's ceiling (IMAGE/VIDEO/AUDIO 16 MiB, FILE 64 MiB, the
//     gateway's own inbound cap).
//   - CHANNEL_MEDIA_UNSUPPORTED (409) — `ChannelSender.capabilities.media` is false.
export type ArtifactApplicationErrors =
	| 'THREAD_NOT_FOUND'
	| 'ISSUE_NOT_FOUND'
	| 'ARTIFACT_NOT_FOUND'
	| 'ARTIFACT_NOT_PREVIEWABLE'
	| 'ARTIFACT_FILE_MISSING'
	| 'ARTIFACT_TOO_LARGE'
	| 'CHANNEL_MEDIA_UNSUPPORTED'
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
	ARTIFACT_FILE_MISSING: HttpStatusCode.UNPROCESSABLE_ENTITY,
	ARTIFACT_TOO_LARGE: HttpStatusCode.REQUEST_TOO_LONG,
	CHANNEL_MEDIA_UNSUPPORTED: HttpStatusCode.CONFLICT,
})
