import { HttpStatusCode, registerErrorCodes } from '@template/core-typescript'
import type { BaseDomainErrors, BaseApplicationErrors, BaseInterfaceErrors, BaseInfrastructureErrors } from '@template/core-typescript'

export type NotificationsDomainErrors = 'EMPTY_RECIPIENTS' | 'NO_CHANNEL_ENABLED'
export type DomainErrors = BaseDomainErrors | NotificationsDomainErrors

export type NotificationsApplicationErrors = 'NOTIFICATION_DELIVERY_NOT_FOUND' | 'DELIVERY_NOT_OWNED_BY_USER'
export type ApplicationErrors = BaseApplicationErrors | NotificationsApplicationErrors

export type InterfaceErrors = BaseInterfaceErrors
export type InfrastructureErrors = BaseInfrastructureErrors
export type Errors = ApplicationErrors | DomainErrors | InfrastructureErrors | InterfaceErrors

registerErrorCodes({
	EMPTY_RECIPIENTS: HttpStatusCode.UNPROCESSABLE_ENTITY,
	NO_CHANNEL_ENABLED: HttpStatusCode.UNPROCESSABLE_ENTITY,
	NOTIFICATION_DELIVERY_NOT_FOUND: HttpStatusCode.NOT_FOUND,
	DELIVERY_NOT_OWNED_BY_USER: HttpStatusCode.FORBIDDEN,
})
