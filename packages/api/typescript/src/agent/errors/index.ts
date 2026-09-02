import { HttpStatusCode, registerErrorCodes } from '@codm/core-typescript'
import type { BaseDomainErrors, BaseApplicationErrors, BaseInterfaceErrors, BaseInfrastructureErrors } from '@codm/core-typescript'

// Domain Errors — invariants of the agent runtime (single SSE observer per issue). Descend from
// whatscode's AgentStreamRegistry error vocabulary (CHAT_ALREADY_STREAMING → SESSION_ALREADY_STREAMING),
// rekeyed chatId → issueId.
//
// These codes are PUBLIC vocabulary — an HTTP status, an i18n key in
// packages/app/react/src/locales/{en,pt}.json, and a regenerated member of the SDK's `ErrorCode`
// union. Renaming one costs a four-stop ripple and buys nothing. The type ALIASES around them DID
// rename with the context, because those are internal symbols.
export type AgentDomainErrors =
	| 'SESSION_ALREADY_STREAMING'
	// A model tried to DECLARE a transport stop (AUTH_REQUIRED / SERVER_ERROR). Those are observed by
	// the runner on the process and the stream — a declared one would be an observation about a
	// subsystem the model cannot see, and would make the FactSource column lie.
	| 'AGENT_TRANSPORT_STOP_NOT_DECLARABLE'
	// The declared transport didn't bring the field it requires (STDIO without a command, HTTP
	// without a URL) — the entity schema's own `.refine()` raises this, à moda de `Owner`.
	| 'MCP_SERVER_TRANSPORT_INCOMPLETE'
	// A tool-approval decision that was already answered (APPROVED/DENIED) does not reopen —
	// invariant of `McpToolApproval`.
	| 'MCP_APPROVAL_ALREADY_SETTLED'
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
	| 'MCP_SERVER_KEY_CONFLICT'
	| 'MCP_SERVER_NOT_FOUND'
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
export type AgentInterfaceErrors =
	| 'AGENT_RUN_TOKEN_INVALID'
	| 'AGENT_RUN_SCOPE_MISMATCH'
	// The external tool requires the owner's approval; the call did not execute and a stop was raised.
	| 'MCP_TOOL_APPROVAL_REQUIRED'
export type InterfaceErrors = BaseInterfaceErrors | AgentInterfaceErrors

export type AgentInfrastructureErrors = never
export type InfrastructureErrors = BaseInfrastructureErrors | AgentInfrastructureErrors

export type Errors = ApplicationErrors | DomainErrors | InfrastructureErrors | InterfaceErrors

registerErrorCodes({
	// Domain — um segundo OBSERVER para uma issue que já tem um. A exclusão de RUN não vive mais
	// aqui: é o lease por alvo do mailbox.
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
	// Third-party MCP servers — registry + approval vocabulary (Task T1 contract lock).
	MCP_SERVER_KEY_CONFLICT: HttpStatusCode.CONFLICT,
	MCP_SERVER_NOT_FOUND: HttpStatusCode.NOT_FOUND,
	MCP_SERVER_TRANSPORT_INCOMPLETE: HttpStatusCode.UNPROCESSABLE_ENTITY,
	MCP_APPROVAL_ALREADY_SETTLED: HttpStatusCode.CONFLICT,
	MCP_TOOL_APPROVAL_REQUIRED: HttpStatusCode.FORBIDDEN,
})
