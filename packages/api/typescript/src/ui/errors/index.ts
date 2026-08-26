import { HttpStatusCode, registerErrorCodes } from '@codm/core-typescript'
import type { BaseDomainErrors, BaseApplicationErrors, BaseInterfaceErrors, BaseInfrastructureErrors } from '@codm/core-typescript'

export type UiDomainErrors = never
export type DomainErrors = BaseDomainErrors | UiDomainErrors

// GATEWAY_UNAVAILABLE moved to external/errors — the wildcard ChannelProxy (external context) is
// the only artifact that talks to the Go channel gateway since the per-endpoint ui proxies died.
//
// CONTACT_AVATAR_NOT_FOUND answers FIVE conditions with one code (see GetContactAvatar): unknown
// channel, another owner's channel, a remote that is not in it, a remote with no photo, and an
// origin that would not hand the photo over. The console draws initials for all five.
// ONBOARDING_DRAFT_INCOMPLETE (spec 2026-08-26): CompleteOnboarding's atomic commit refuses a
// rascunho sem contactRef + workspace(path|existingWorkspaceId) + providers — sem os três não há
// como materializar Workspace/Thread. 422: a requisição está bem-formada, o ESTADO é que não chegou lá.
export type UiApplicationErrors = 'CONTACT_AVATAR_NOT_FOUND' | 'ONBOARDING_NOT_COMPLETED' | 'ONBOARDING_DRAFT_INCOMPLETE'
export type ApplicationErrors = BaseApplicationErrors | UiApplicationErrors

export type UiInfrastructureErrors = never
export type InfrastructureErrors = BaseInfrastructureErrors | UiInfrastructureErrors

export type UiInterfaceErrors = never
export type InterfaceErrors = BaseInterfaceErrors | UiInterfaceErrors

export type Errors = ApplicationErrors | DomainErrors | InfrastructureErrors | InterfaceErrors

registerErrorCodes({
	CONTACT_AVATAR_NOT_FOUND: HttpStatusCode.NOT_FOUND,
	ONBOARDING_NOT_COMPLETED: HttpStatusCode.FORBIDDEN,
	ONBOARDING_DRAFT_INCOMPLETE: HttpStatusCode.UNPROCESSABLE_ENTITY,
})
