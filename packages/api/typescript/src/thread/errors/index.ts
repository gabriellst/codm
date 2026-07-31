import { HttpStatusCode, registerErrorCodes } from '@codm/core-typescript'
import type { BaseDomainErrors, BaseApplicationErrors, BaseInterfaceErrors, BaseInfrastructureErrors } from '@codm/core-typescript'

// Domain errors — Thread aggregate invariants (raised by entity methods).
export type ThreadDomainErrors =
	| 'NO_PROVIDER_SELECTED'
	| 'LAST_INVOKER'
	| 'PARTICIPANT_NOT_FOUND'
	// Transcript invariants (B4, decision 2) — the thread owns who may cite what and who needs a sender.
	| 'QUOTED_ENTRY_NOT_IN_THREAD'
	| 'CONTACT_ENTRY_REQUIRES_SENDER'
	| 'AGENT_ENTRY_FORBIDS_SENDER'
	// Stop invariants (B4, spec decision 4) — the Stop is a child of this aggregate.
	| 'STOP_NOT_IN_THREAD'
	| 'STOP_ALREADY_RESOLVED'
	| 'RESOLUTION_NOT_APPLICABLE'
	// Soft delete (thread-deletion spec, decision 8) — `Thread.delete()` refuses a second deletion.
	| 'THREAD_ALREADY_DELETED'
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
	// The SECOND axis of "can this thread run" — installed (above) vs drivable (here). `AttachThread`
	// used to ask only the first question, so a machine with the codex CLI on PATH could bind a thread
	// to a provider this engine has no `AgentRunner` for, and the lie surfaced a screen later as an
	// infrastructure NOT_IMPLEMENTED out of `AgentRunnerFactory.for` — on a conversation already
	// created. It is an APPLICATION code because the fact is about this deployment's WIRING (which
	// runners are bound), not about the Thread aggregate: the entity cannot see the factory, and a
	// thread carrying an undrivable provider is a legal past state that must still load.
	| 'PROVIDER_COMING_SOON'
	| 'ENTRY_NOT_FOUND'
	| 'ENTRY_NOT_INVOCABLE'
	| 'CLARIFICATION_ALREADY_PENDING'
	// Soft delete (thread-deletion spec, decision 2). CROSS-AGGREGATE, which is why it is an application
	// code and not a domain one: neither the WORKING issue (another context's row) nor the open stop (a
	// child `Thread` does not hydrate) is visible to the aggregate, so `DeleteThread` reads both and
	// decides. Never a 200 — the operator resolves or cancels the work first.
	| 'THREAD_HAS_ACTIVE_WORK'
	// The stop control plane, moved here in B4 (spec decision 4) with the use cases that raise it.
	| 'STOP_NOT_FOUND'
	| 'STOP_CRITERION_DISABLED'
	// Read across the boundary by RaiseStop's archived guard — a repository READ of the issue context is
	// sanctioned, calling its entity method is not, so the two codes are raised HERE against the flag.
	| 'ISSUE_NOT_FOUND'
	| 'ISSUE_ARCHIVED'
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
	STOP_NOT_IN_THREAD: HttpStatusCode.UNPROCESSABLE_ENTITY,
	STOP_ALREADY_RESOLVED: HttpStatusCode.UNPROCESSABLE_ENTITY,
	RESOLUTION_NOT_APPLICABLE: HttpStatusCode.UNPROCESSABLE_ENTITY,
	// CONFLICT, not 422: the request is well-formed and was legal a moment ago — the row simply moved on.
	// Same status THREAD_ALREADY_ATTACHED carries, for the same "you are acting on a stale screen" cause.
	THREAD_ALREADY_DELETED: HttpStatusCode.CONFLICT,
	// 422 like every other "the state forbids this right now" code in this context (THREAD_PAUSED,
	// ISSUE_ARCHIVED): the operator resolves the stop or lets the issue finish, then deletes.
	THREAD_HAS_ACTIVE_WORK: HttpStatusCode.UNPROCESSABLE_ENTITY,
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
	// 422 beside its sibling: the request is well-formed (the value IS a ProviderKind) and the refusal
	// is about the state of the world, not the shape of the payload. Never a 501 — NOT_IMPLEMENTED is
	// infrastructure's "this implementation cannot do that", and raising it from a write path would
	// tell the operator the SERVER is broken when the honest answer is "not this CLI, not yet".
	PROVIDER_COMING_SOON: HttpStatusCode.UNPROCESSABLE_ENTITY,
	STOP_NOT_FOUND: HttpStatusCode.NOT_FOUND,
	STOP_CRITERION_DISABLED: HttpStatusCode.UNPROCESSABLE_ENTITY,
	ISSUE_NOT_FOUND: HttpStatusCode.NOT_FOUND,
	ISSUE_ARCHIVED: HttpStatusCode.UNPROCESSABLE_ENTITY,
	// Same status the external context registers — one code, one meaning, whichever door raised it.
	GATEWAY_UNAVAILABLE: HttpStatusCode.BAD_GATEWAY,
})
