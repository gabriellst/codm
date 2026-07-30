/**
 * THE SHAPE OF "ON WHOSE BEHALF" — the core half of agent identity (B2, spec decision 6).
 *
 * ─────────────────────────────────────────────────────────────────────────────────────────────────
 * WHAT CORE KNOWS AND WHAT IT DELIBERATELY DOES NOT
 * It knows that a run has a SCOPE (an opaque surface name), an EXPIRY, and some number of id-shaped
 * fields naming what the run is confined to. It does NOT know that the product's scopes are called
 * `issue-handling` / `orchestration` / `system`, and it does NOT know that this product's confinement
 * axes are `ownerId` / `issueId` / `threadId`. That is the whole point: the product tightens the type
 * (`scope: McpScope`, `issueId?: string`) at its own layer, and core keeps the FORMAT.
 *
 * WHY AN INDEX SIGNATURE RATHER THAN A GENERIC PARAMETER ON THE INTERFACE
 * The comparison below has to walk WHATEVER keys the product's identity carries, and it has to do so
 * without being told which. A closed interface would force core to name the axes; a generic would
 * force every core consumer to be generic over it, including the middleware the router resolves by
 * class token (a token has no type arguments at runtime). The index signature says exactly the true
 * thing: `scope` and `expiresAt` are core's, everything else is the product's and core only compares
 * it.
 * ─────────────────────────────────────────────────────────────────────────────────────────────────
 */
export interface AgentIdentity {
	/**
	 * WHICH declared tool surface this credential opens — `string` here, an enum at the product layer.
	 *
	 * It is the AUTHORIZATION half. A credential minted for one surface must not authenticate a call
	 * against another, and core carries the field so the adapter (`McpAdapter`) can make that check
	 * without knowing what the surfaces are.
	 */
	scope: string
	/** Short-lived: the run window plus grace. Expiry is a BACKSTOP; `revoke` is the primary. */
	expiresAt: Date
	/**
	 * Everything else the product confines a run to — `issueId`, `threadId`, `entryId`, `ownerId`,
	 * whatever the product's `IdentitySchema` declared. Compared, never interpreted.
	 */
	[key: string]: unknown
}

/** One disagreement found by `compareIdentity`, with enough context to log WHERE it was. */
export interface IdentityMismatch {
	/** `params.threadId` / `body.issueId` — the layer the offending value arrived on. */
	at: string
	key: string
	claimed: string
	supplied: string
}

/**
 * Every key the IDENTITY carries whose value the CANDIDATE contradicts.
 *
 * ─────────────────────────────────────────────────────────────────────────────────────────────────
 * ALLOW-LIST BY CONSTRUCTION, NOT A DENY-LIST OF THREE STRINGS
 * The predecessor (`agent/mcp/identity.ts`) walked the tool arguments against a hardcoded
 * `IDENTITY_KEYS = ['ownerId','issueId','threadId']` — blind to the fact that different scopes have
 * different identity SHAPES, and forced to SKIP (not reject) a key whose claim was absent. Here the
 * identity itself is the list: an orchestrator identity that carries no `issueId` compares no
 * `issueId`, and that is a property of the DATA rather than of an `if (claimed &&` in a walker.
 *
 * The gap that skipping leaves does not disappear and is not papered over: when the identity does not
 * confine an id the controller accepts, the controller's own `handle()` checks ownership — the rule
 * `SteerIssueTurnController` already implements and which spec decision 4 promotes to documented
 * requirement.
 *
 * WHY A FLAT CANDIDATE AND NOT A DEEP WALK — MEASURED, and the depth was never about depth
 * The old walk was deep because it ran on the JSON-RPC BODY, where a generated tool call nests the
 * request payload under `data` (`{ threadId, data: { issueId, … } }`). This runs one layer later, at
 * the controller the shim actually called, where the same two values have already been split into
 * `params` and `body` by the HTTP layer. Merging those two flat objects reaches exactly the same
 * three axes, at the point where they are already named.
 *
 * A non-string on either side is ignored rather than coerced: it cannot name an id, and comparing it
 * would invent a verdict no schema promised. ALL mismatches are returned, never the first — the log
 * should record the full shape of an attempt, not whichever axis happened to be walked first.
 * ─────────────────────────────────────────────────────────────────────────────────────────────────
 */
export function compareIdentity(identity: AgentIdentity, candidate: Readonly<Record<string, unknown>>, at = ''): IdentityMismatch[] {
	const mismatches: IdentityMismatch[] = []
	for (const [key, claimed] of Object.entries(identity)) {
		if (key === 'scope' || typeof claimed !== 'string' || claimed.length === 0) continue
		const supplied = candidate[key]
		if (typeof supplied !== 'string') continue
		if (supplied !== claimed) mismatches.push({ at: at ? `${at}.${key}` : key, key, claimed, supplied })
	}
	return mismatches
}

/**
 * The header an agent run token travels in.
 *
 * SINGLE-SOURCED HERE because core is the SERVER side of it (`AgentIdentityMiddleware` reads it) and
 * core cannot import from `@codm/client-typescript` — the api depends on the SDK, so the edge would
 * be a cycle. The generated per-scope `_http.ts` shims send this and ONLY this (no `authorization`
 * fallback), and the SDK's own `MCP_RUN_TOKEN_HEADER` must agree byte for byte; the api-side rail in
 * `tests/architecture/mcp-exposure.test.ts` pins the pair, because it is the one place that may
 * import both sides.
 */
export const AGENT_RUN_TOKEN_HEADER = 'x-codedm-run-token'

/**
 * Read the run token off a request — the dedicated header, or `Authorization: Bearer <token>`.
 *
 * Both spellings, because the two callers differ: the generated shim sets the dedicated header, and an
 * external MCP client driving the door by hand may only be able to set `Authorization`. Returns `''`
 * when there is none, which the middleware reads as "not an agent call" rather than as a failure.
 */
export function readAgentRunToken(headers: Readonly<Record<string, string | undefined>> | undefined): string {
	const dedicated = headers?.[AGENT_RUN_TOKEN_HEADER] ?? headers?.[AGENT_RUN_TOKEN_HEADER.toLowerCase()]
	if (dedicated) return dedicated
	const authorization = headers?.authorization ?? headers?.Authorization ?? ''
	return authorization.toLowerCase().startsWith('bearer ') ? authorization.slice('bearer '.length).trim() : ''
}
