import { HttpStatusCode, registerErrorCodes } from '@codedm/core-typescript'
import type { BaseDomainErrors, BaseApplicationErrors, BaseInterfaceErrors, BaseInfrastructureErrors } from '@codedm/core-typescript'

export type UiDomainErrors = never
export type DomainErrors = BaseDomainErrors | UiDomainErrors

// GATEWAY_UNAVAILABLE — the api-ts channel proxy (ConnectChannel) could not reach the Go channel
// gateway: connection refused (gateway not running), timeout, or an upstream 5xx. Mapped to 502 Bad
// Gateway — api-ts IS a proxy to the Go pairing service, so an honest "upstream down" surfaces as a
// named error the console can translate, NOT the proxy's own 500 soup.
export type UiApplicationErrors = 'GATEWAY_UNAVAILABLE'
export type ApplicationErrors = BaseApplicationErrors | UiApplicationErrors

export type UiInfrastructureErrors = never
export type InfrastructureErrors = BaseInfrastructureErrors | UiInfrastructureErrors

export type UiInterfaceErrors = never
export type InterfaceErrors = BaseInterfaceErrors | UiInterfaceErrors

export type Errors = ApplicationErrors | DomainErrors | InfrastructureErrors | InterfaceErrors

registerErrorCodes({
	GATEWAY_UNAVAILABLE: HttpStatusCode.BAD_GATEWAY,
})
