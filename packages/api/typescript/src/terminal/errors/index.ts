import { HttpStatusCode, registerErrorCodes } from '@template/core-typescript'
import type { BaseDomainErrors, BaseApplicationErrors, BaseInterfaceErrors, BaseInfrastructureErrors } from '@template/core-typescript'

// Domain Errors — invariants of the terminal-session runtime (single-active per issue, single
// observer per issue). Descend from whatscode's AgentStreamRegistry error vocabulary
// (CHAT_ALREADY_STREAMING → SESSION_ALREADY_STREAMING), rekeyed chatId → issueId.
export type TerminalDomainErrors = 'TERMINAL_ALREADY_RUNNING' | 'SESSION_ALREADY_STREAMING'
export type DomainErrors = BaseDomainErrors | TerminalDomainErrors

// Application Errors — orchestration failures of the runtime: too many concurrent observers, a
// provider CLI that isn't installed, a subprocess that failed to spawn, an LLM classify call that
// produced no usable decision.
export type TerminalApplicationErrors =
	| 'TOO_MANY_TERMINAL_STREAMS'
	| 'PROVIDER_NOT_DETECTED'
	| 'TERMINAL_SPAWN_FAILED'
	| 'CLASSIFICATION_FAILED'
export type ApplicationErrors = BaseApplicationErrors | TerminalApplicationErrors

export type TerminalInterfaceErrors = never
export type InterfaceErrors = BaseInterfaceErrors | TerminalInterfaceErrors

export type TerminalInfrastructureErrors = never
export type InfrastructureErrors = BaseInfrastructureErrors | TerminalInfrastructureErrors

export type Errors = ApplicationErrors | DomainErrors | InfrastructureErrors | InterfaceErrors

registerErrorCodes({
	// Domain — a second run/observer for an issue that already has one.
	TERMINAL_ALREADY_RUNNING: HttpStatusCode.CONFLICT,
	SESSION_ALREADY_STREAMING: HttpStatusCode.CONFLICT,
	// Application.
	TOO_MANY_TERMINAL_STREAMS: HttpStatusCode.TOO_MANY_REQUESTS,
	PROVIDER_NOT_DETECTED: HttpStatusCode.UNPROCESSABLE_ENTITY,
	TERMINAL_SPAWN_FAILED: HttpStatusCode.SERVICE_UNAVAILABLE,
	CLASSIFICATION_FAILED: HttpStatusCode.SERVICE_UNAVAILABLE,
})
