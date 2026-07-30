import { registerErrorCodes } from '@codm/core-typescript'
import type { BaseDomainErrors, BaseApplicationErrors, BaseInterfaceErrors, BaseInfrastructureErrors } from '@codm/core-typescript'

export type UiDomainErrors = never
export type DomainErrors = BaseDomainErrors | UiDomainErrors

// GATEWAY_UNAVAILABLE moved to external/errors — the wildcard ChannelProxy (external context) is
// the only artifact that talks to the Go channel gateway since the per-endpoint ui proxies died.
export type UiApplicationErrors = never
export type ApplicationErrors = BaseApplicationErrors | UiApplicationErrors

export type UiInfrastructureErrors = never
export type InfrastructureErrors = BaseInfrastructureErrors | UiInfrastructureErrors

export type UiInterfaceErrors = never
export type InterfaceErrors = BaseInterfaceErrors | UiInterfaceErrors

export type Errors = ApplicationErrors | DomainErrors | InfrastructureErrors | InterfaceErrors

registerErrorCodes({})
