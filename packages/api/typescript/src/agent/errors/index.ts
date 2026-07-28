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
export type AgentDomainErrors =
	| 'TERMINAL_ALREADY_RUNNING'
	| 'SESSION_ALREADY_STREAMING'
	// A model tried to DECLARE a transport stop (AUTH_REQUIRED / SERVER_ERROR). Those are observed by
	// the runner on the process and the stream — a declared one would be an observation about a
	// subsystem the model cannot see, and would make the FactSource column lie.
	| 'AGENT_TRANSPORT_STOP_NOT_DECLARABLE'
export type DomainErrors = BaseDomainErrors | AgentDomainErrors

// Application Errors — orchestration failures of the runtime: too many concurrent observers, a
// provider CLI that isn't installed, a subprocess that failed to spawn, an LLM classify call that
// produced no usable decision.
export type AgentApplicationErrors =
	| 'TOO_MANY_TERMINAL_STREAMS'
	| 'PROVIDER_NOT_DETECTED'
	| 'TERMINAL_SPAWN_FAILED'
	| 'CLASSIFICATION_FAILED'
	| 'AGENT_TOOLS_UNSUPPORTED'
export type ApplicationErrors = BaseApplicationErrors | AgentApplicationErrors

/**
 * Interface Errors — the MCP router's per-call authorization boundary (§4.4, §5.1). This union was
 * `never` until Fase 6.
 *
 * TWO codes, deliberately not one:
 *  - `AGENT_RUN_TOKEN_INVALID` (401) — absent, unknown, expired or revoked run token. The caller has
 *    not proven who it is, and re-authenticating is the honest remedy.
 *  - `AGENT_RUN_SCOPE_MISMATCH` (403) — the token is VALID and the TARGET is wrong: a tool argument
 *    names an `issueId` / `threadId` / `ownerId` that disagrees with the claims. Answering 401 here
 *    would tell the client to authenticate again when authenticating changes nothing, and would leave
 *    the log unable to tell an expired run apart from an attempted cross-issue write — which is
 *    exactly the prompt-injection path the mitigation exists to catch.
 */
export type AgentInterfaceErrors = 'AGENT_RUN_TOKEN_INVALID' | 'AGENT_RUN_SCOPE_MISMATCH'
export type InterfaceErrors = BaseInterfaceErrors | AgentInterfaceErrors

export type AgentInfrastructureErrors = never
export type InfrastructureErrors = BaseInfrastructureErrors | AgentInfrastructureErrors

export type Errors = ApplicationErrors | DomainErrors | InfrastructureErrors | InterfaceErrors

registerErrorCodes({
	// Domain — a second run/observer for an issue that already has one.
	TERMINAL_ALREADY_RUNNING: HttpStatusCode.CONFLICT,
	SESSION_ALREADY_STREAMING: HttpStatusCode.CONFLICT,
	AGENT_TRANSPORT_STOP_NOT_DECLARABLE: HttpStatusCode.UNPROCESSABLE_ENTITY,
	// Application.
	TOO_MANY_TERMINAL_STREAMS: HttpStatusCode.TOO_MANY_REQUESTS,
	PROVIDER_NOT_DETECTED: HttpStatusCode.UNPROCESSABLE_ENTITY,
	TERMINAL_SPAWN_FAILED: HttpStatusCode.SERVICE_UNAVAILABLE,
	CLASSIFICATION_FAILED: HttpStatusCode.SERVICE_UNAVAILABLE,
	// An agent that REQUIRES a tool scope was pointed at a CLI whose probed capabilities have no
	// mcp-config flag. Same status as PROVIDER_NOT_DETECTED — the environment cannot serve the
	// request, and silently dropping the scope would degrade the run into the inferred path without
	// anyone noticing (§4.7).
	AGENT_TOOLS_UNSUPPORTED: HttpStatusCode.UNPROCESSABLE_ENTITY,
	// Interface — the MCP router's per-call boundary. See the union above for why these are two codes.
	AGENT_RUN_TOKEN_INVALID: HttpStatusCode.UNAUTHORIZED,
	AGENT_RUN_SCOPE_MISMATCH: HttpStatusCode.FORBIDDEN,
})
