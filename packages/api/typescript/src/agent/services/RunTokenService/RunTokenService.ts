import type { AgentName } from '../../enums'
import type { McpScope } from '../../mcp/manifest'

/**
 * The claims a run token carries (GOAL-agent-abstraction §4.4). This is the ONLY place a tool handler
 * reads identity from — never the tool payload.
 *
 * These are the SAME `ownerId` / `issueId` / `threadId` that the agent's input envelope carries
 * (§4.6): the base `Agent` copies them across when it mints, because it is the only layer that sees
 * both sides. One origin, two uses, and `AgentRunRequest` stays free of all three.
 */
export interface RunTokenClaims {
	ownerId: string
	/**
	 * The issue this run is confined to — OPTIONAL since the orchestrator pivot (§7.2.1).
	 *
	 * Present for every `issue-handling` run, ABSENT for every `orchestration` one: the orchestrator is
	 * keyed by THREAD (§6.1 — a session with `issue_id IS NULL`) and has no issue to be confined to.
	 * `Agent.buildMcpInvocation` enforces the pairing PER SCOPE, so "a token that can call issue-work
	 * tools always names its issue" still holds by construction.
	 *
	 * ### What weakens when it is absent — said out loud, because it does not announce itself
	 * `assertIdentityMatchesClaims` compares an argument only when the matching claim is non-empty. With
	 * no `issueId` claim it stops checking `issueId` ENTIRELY: it does not reject, it SKIPS. So an
	 * `orchestration` tool that accepts an `issueId` gets no protection from the generic walker and must
	 * verify ownership itself (`issue.threadId === claims.threadId`). That is the named requirement of
	 * §7.2.1, and it is not optional — the model driving these runs reads messages written by third
	 * parties in a group chat.
	 */
	issueId?: string
	threadId: string
	/**
	 * The transcript entry that TRIGGERED this run, when one did (§7.2).
	 *
	 * The router injects it as `originEntryId` when `issue/create` is called, which is exactly why that
	 * tool does not accept it as an argument: a model able to name the message it was "answering" could
	 * attribute its issue to any line in the conversation, and the reply would then quote a message
	 * nobody wrote it about.
	 */
	entryId?: string
	agentName: AgentName
	/**
	 * WHICH declared tool surface this credential opens — the AUTHORIZATION half of the claims, added
	 * in Fase 6 (contract defect D6-8) after the router shipped able to answer any scope for any token.
	 *
	 * Without it a token is a bearer credential for the WHOLE MCP door: `IssueWorkAgent` is minted for
	 * `issue-handling` (six writes on its own issue) and the same bytes would authenticate a
	 * `tools/call` against `/mcp/system` and its twenty-three operations — `CreateOwner`,
	 * `DisableOwner`, `AddWorkspace`, `RemoveWorkspace` among them. None of those carry
	 * `ownerId`/`issueId`/`threadId` in their tool arguments, so the identity walk finds nothing to
	 * reject and waves them through. The token travels on the child CLI's argv, readable by the very
	 * shell-capable model this design defends against, so "the agent only asks for its own scope" is
	 * not a property anyone can rely on.
	 *
	 * `--allowedTools` is the CLIENT-side half of the same rule; this is the SERVER-side half, and only
	 * the server-side one is a boundary.
	 */
	scope: McpScope
	/** Short-lived: the run window plus a grace period. Expiry is a backstop; `revoke` is the primary. */
	expiresAt: Date
}

/**
 * Mint / verify / revoke for the opaque run token that carries a run's identity to the MCP router.
 *
 * CONTRACT ONLY IN FASE 1 — deliberately. The signature is frozen here because three separate
 * artifacts are written against it before it can possibly exist: `AgentMcpInvocation.token` (this
 * phase), the base `Agent`'s template-method `run()` (Fase 5) and the runner's termination path
 * (Fase 2/3). The implementation is born in Fase 6, together with the router that verifies against
 * it. That ordering IS the Phase-0 Contract Lock discipline — freeze the vocabulary, then build.
 *
 * The three verbs map 1:1 onto three DIFFERENT callers, and the separation is an invariant that
 * AC-6.12 greps for, not a style preference:
 *
 * | verb     | sole caller                    | why it and nobody else                                        |
 * |----------|--------------------------------|---------------------------------------------------------------|
 * | `mint`   | the base `Agent` (`run()`)     | only layer holding the input envelope AND building the request |
 * | `verify` | the MCP router, per tool call  | authorization is a per-CALL boundary, not a per-run one        |
 * | `revoke` | the `AgentRunner`, at run end  | only it knows the process died (normal, error or cancelled)    |
 *
 * A runner that mints is a bad practice with a name (§5.4 item 8): it would have to be handed the
 * identity the seam exists to keep out.
 */
export abstract class RunTokenService {
	/** Issue an opaque token for one run. Called EXCLUSIVELY by the base `Agent`. */
	abstract mint(claims: RunTokenClaims): string

	/** Resolve a token to its claims, or `null` when unknown / expired / revoked. Called by the MCP router. */
	abstract verify(token: string): RunTokenClaims | null

	/** Invalidate a token at run termination. Called EXCLUSIVELY by the `AgentRunner`. Idempotent. */
	abstract revoke(token: string): void
}
