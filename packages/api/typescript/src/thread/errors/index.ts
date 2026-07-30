import { HttpStatusCode, registerErrorCodes } from '@codedm/core-typescript'
import type { BaseDomainErrors, BaseApplicationErrors, BaseInterfaceErrors, BaseInfrastructureErrors } from '@codedm/core-typescript'

// Domain errors — Thread aggregate invariants (raised by entity methods).
export type ThreadDomainErrors =
	| 'NO_PROVIDER_SELECTED'
	| 'LAST_INVOKER'
	| 'PARTICIPANT_NOT_FOUND'
	// Transcript invariants (B4, decision 2) — the thread owns who may cite what and who needs a sender.
	| 'QUOTED_ENTRY_NOT_IN_THREAD'
	| 'CONTACT_ENTRY_REQUIRES_SENDER'
	| 'AGENT_ENTRY_FORBIDS_SENDER'
export type DomainErrors = BaseDomainErrors | ThreadDomainErrors

// Application errors — orchestration in the thread use cases + routing pipeline.
export type ThreadApplicationErrors =
	| 'THREAD_NOT_FOUND'
	| 'THREAD_ALREADY_ATTACHED'
	| 'THREAD_PAUSED'
	| 'THREAD_NOT_PAUSED'
	| 'NO_CHANNEL_CONNECTED'
	| 'CHANNEL_NOT_CONNECTED'
	| 'WORKSPACE_NOT_FOUND'
	| 'PROVIDER_NOT_DETECTED'
	| 'ENTRY_NOT_FOUND'
	| 'ENTRY_NOT_INVOCABLE'
	| 'CLARIFICATION_ALREADY_PENDING'
	// The Go gateway did not answer a WRITE. Same code the browser-facing proxy already surfaces for
	// the same cause, declared here too because this context now calls the gateway directly.
	| 'GATEWAY_UNAVAILABLE'
export type ApplicationErrors = BaseApplicationErrors | ThreadApplicationErrors

export type ThreadInterfaceErrors = never
export type InterfaceErrors = BaseInterfaceErrors | ThreadInterfaceErrors

export type ThreadInfrastructureErrors = never
export type InfrastructureErrors = BaseInfrastructureErrors | ThreadInfrastructureErrors

export type Errors = ApplicationErrors | DomainErrors | InfrastructureErrors | InterfaceErrors

registerErrorCodes({
	NO_PROVIDER_SELECTED: HttpStatusCode.BAD_REQUEST,
	LAST_INVOKER: HttpStatusCode.UNPROCESSABLE_ENTITY,
	PARTICIPANT_NOT_FOUND: HttpStatusCode.NOT_FOUND,
	QUOTED_ENTRY_NOT_IN_THREAD: HttpStatusCode.UNPROCESSABLE_ENTITY,
	CONTACT_ENTRY_REQUIRES_SENDER: HttpStatusCode.UNPROCESSABLE_ENTITY,
	AGENT_ENTRY_FORBIDS_SENDER: HttpStatusCode.UNPROCESSABLE_ENTITY,
	THREAD_NOT_FOUND: HttpStatusCode.NOT_FOUND,
	THREAD_ALREADY_ATTACHED: HttpStatusCode.CONFLICT,
	THREAD_PAUSED: HttpStatusCode.UNPROCESSABLE_ENTITY,
	THREAD_NOT_PAUSED: HttpStatusCode.UNPROCESSABLE_ENTITY,
	NO_CHANNEL_CONNECTED: HttpStatusCode.UNPROCESSABLE_ENTITY,
	CHANNEL_NOT_CONNECTED: HttpStatusCode.UNPROCESSABLE_ENTITY,
	ENTRY_NOT_FOUND: HttpStatusCode.NOT_FOUND,
	ENTRY_NOT_INVOCABLE: HttpStatusCode.UNPROCESSABLE_ENTITY,
	CLARIFICATION_ALREADY_PENDING: HttpStatusCode.CONFLICT,
	// Shared codes AttachThread raises across BC boundaries — re-registered here with the SAME status
	// as their owning context (workspace / terminal) to satisfy per-file union↔registration parity
	// (registerErrorCodes is Object.assign — an idempotent overwrite, not a conflict).
	WORKSPACE_NOT_FOUND: HttpStatusCode.NOT_FOUND,
	PROVIDER_NOT_DETECTED: HttpStatusCode.UNPROCESSABLE_ENTITY,
	// Same status the external context registers — one code, one meaning, whichever door raised it.
	GATEWAY_UNAVAILABLE: HttpStatusCode.BAD_GATEWAY,
})
