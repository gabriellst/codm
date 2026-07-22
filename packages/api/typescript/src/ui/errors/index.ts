import type { BaseDomainErrors, BaseApplicationErrors, BaseInterfaceErrors, BaseInfrastructureErrors } from '@template/core-typescript'

export type UiDomainErrors = never
export type DomainErrors = BaseDomainErrors | UiDomainErrors

export type UiApplicationErrors = never
export type ApplicationErrors = BaseApplicationErrors | UiApplicationErrors

export type UiInfrastructureErrors = never
export type InfrastructureErrors = BaseInfrastructureErrors | UiInfrastructureErrors

export type UiInterfaceErrors = never
export type InterfaceErrors = BaseInterfaceErrors | UiInterfaceErrors

export type Errors = ApplicationErrors | DomainErrors | InfrastructureErrors | InterfaceErrors
