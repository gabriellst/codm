import { HttpStatusCode, registerErrorCodes } from '@codedm/core-typescript'
import type { BaseDomainErrors, BaseApplicationErrors, BaseInterfaceErrors, BaseInfrastructureErrors } from '@codedm/core-typescript'

// Domain Errors — invariants of the agent runtime (single-active RUN per issue, single SSE observer
// per issue). Descend from whatscode's AgentStreamRegistry error vocabulary
// (CHAT_ALREADY_STREAMING → SESSION_ALREADY_STREAMING), rekeyed chatId → issueId.
//
// The CODES keep the `TERMINAL_*` spelling on purpose, and Fase 5 did not touch them
// (GOAL-agent-abstraction §5.1): an error code is PUBLIC vocabulary — an HTTP status, an i18n key in
// packages/app/react/src/locales/{en,pt}.json, and a regenerated member of the SDK's `ErrorCode`
// union. Renaming one costs a four-stop ripple and buys nothing. The type ALIASES around them DID
// rename with the context, because those are internal symbols.
export type AgentDomainErrors = 'TERMINAL_ALREADY_RUNNING' | 'SESSION_ALREADY_STREAMING'
export type DomainErrors = BaseDomainErrors | AgentDomainErrors

// Application Errors — orchestration failures of the runtime: too many concurrent observers, a
// provider CLI that isn't installed, a subprocess that failed to spawn, an LLM classify call that
// produced no usable decision.
export type AgentApplicationErrors =
	| 'TOO_MANY_TERMINAL_STREAMS'
	| 'PROVIDER_NOT_DETECTED'
	| 'TERMINAL_SPAWN_FAILED'
	| 'CLASSIFICATION_FAILED'
export type ApplicationErrors = BaseApplicationErrors | AgentApplicationErrors

export type AgentInterfaceErrors = never
export type InterfaceErrors = BaseInterfaceErrors | AgentInterfaceErrors

export type AgentInfrastructureErrors = never
export type InfrastructureErrors = BaseInfrastructureErrors | AgentInfrastructureErrors

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
