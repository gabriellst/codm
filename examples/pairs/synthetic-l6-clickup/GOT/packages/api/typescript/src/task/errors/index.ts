import { HttpStatusCode, registerErrorCodes } from '@template/core-typescript'
import type { BaseDomainErrors, BaseApplicationErrors, BaseInterfaceErrors, BaseInfrastructureErrors } from '@template/core-typescript'

export type TaskDomainErrors = 'TASK_STATUS_UNCHANGED'
export type DomainErrors = BaseDomainErrors | TaskDomainErrors

export type TaskApplicationErrors = 'TASK_NOT_FOUND' | 'SPACE_NOT_FOUND' | 'LIST_NOT_IN_SPACE'
export type ApplicationErrors = BaseApplicationErrors | TaskApplicationErrors

export type TaskInterfaceErrors = never
export type InterfaceErrors = BaseInterfaceErrors | TaskInterfaceErrors

export type TaskInfrastructureErrors = never
export type InfrastructureErrors = BaseInfrastructureErrors | TaskInfrastructureErrors

export type Errors = ApplicationErrors | DomainErrors | InfrastructureErrors | InterfaceErrors

// Side-effect import: register this context's error codes with the framework
// runtime registry. Mirrors Go's RegisterErrorCodes() pattern in init().
registerErrorCodes({
	TASK_NOT_FOUND: HttpStatusCode.NOT_FOUND,
	SPACE_NOT_FOUND: HttpStatusCode.NOT_FOUND,
	LIST_NOT_IN_SPACE: HttpStatusCode.BAD_REQUEST,
	TASK_STATUS_UNCHANGED: HttpStatusCode.BAD_REQUEST,
})
