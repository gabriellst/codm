import { HttpStatusCode, registerErrorCodes } from '@codm/core-typescript'
import type { BaseDomainErrors, BaseApplicationErrors, BaseInterfaceErrors, BaseInfrastructureErrors } from '@codm/core-typescript'

export type ExternalDomainErrors = never
export type DomainErrors = BaseDomainErrors | ExternalDomainErrors

// GATEWAY_UNAVAILABLE — the ChannelProxy could not reach the Go channel gateway: connection refused
// (gateway not running), or the upstream socket died mid-handshake. Mapped to 502 Bad Gateway —
// api-ts IS a reverse proxy to the Go pairing/messaging service, so an honest "upstream down"
// surfaces as a named error the console can translate, NOT the proxy's own 500 soup.
// (Moved here from ui/errors when the pairing strategy switched from per-endpoint ui proxies to
// this wildcard external proxy — the i18n mapping `errors.GATEWAY_UNAVAILABLE` survives unchanged.)
export type ExternalApplicationErrors = 'GATEWAY_UNAVAILABLE'
export type ApplicationErrors = BaseApplicationErrors | ExternalApplicationErrors

export type ExternalInfrastructureErrors = never
export type InfrastructureErrors = BaseInfrastructureErrors | ExternalInfrastructureErrors

export type ExternalInterfaceErrors = never
export type InterfaceErrors = BaseInterfaceErrors | ExternalInterfaceErrors

export type Errors = ApplicationErrors | DomainErrors | InfrastructureErrors | InterfaceErrors

registerErrorCodes({
	GATEWAY_UNAVAILABLE: HttpStatusCode.BAD_GATEWAY,
})
