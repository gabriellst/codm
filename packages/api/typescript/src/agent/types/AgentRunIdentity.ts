import { z } from '@codedm/core-typescript'
import type { AgentIdentity } from '@codedm/core-typescript'
import { McpScope } from '@codedm/contracts-typescript/wire/enums'
import type Z from 'zod'
import type { AgentName } from '../enums'

/**
 * THE FIELDS A RUN IS CONFINED TO — the product's half of agent identity (B2, spec decision 3).
 *
 * ─────────────────────────────────────────────────────────────────────────────────────────────────
 * THIS IS THE BASE, NOT THE CONTRACT. Each agent narrows it into its OWN `static IdentitySchema`:
 * `IssueWorkAgent` requires `issueId`, `OrchestratorAgent` does not have the field at all. That is
 * the inversion this frente is about — "which scope needs which id" used to be a `Record<McpScope,
 * 'issue'|'thread'>` in a manifest, read by exactly ONE call site, and a scope added tomorrow was a
 * line somebody had to remember to add. Now the requirement is stated by the agent that has it, in
 * the file that has it, and parsed BEFORE a credential exists.
 *
 * WHY THE VALUES ARE PRIMITIVES AND NOT `z.instance(Id)`. This is not an entity and not a value
 * object: it is the payload of a credential that travels to a child CLI and comes back on a header.
 * The project's layer rule (CLAUDE.md) puts `z.instance(Id)` on entity and value-object schemas ONLY;
 * events, use cases, controllers and credentials keep `z.uuid()`.
 *
 * WHY `entryId` LIVES HERE AND NOT IN A TOOL SCHEMA. `ForkIssue` needs the transcript entry the
 * operator's request arrived on, because that entry is what the finished answer quotes. If the field
 * were an argument the MODEL would supply it — and a model reading a group chat written by third
 * parties could attribute its issue to any message in the conversation. Keeping it OUT of every
 * schema makes the attribution unforgeable by construction rather than by validation: there is no
 * argument to check, because there is no argument.
 * ─────────────────────────────────────────────────────────────────────────────────────────────────
 */
export const AgentRunIdentitySchema = z.object({
	ownerId: z.uuid(),
	/**
	 * The issue this run is confined to. OPTIONAL IN THE BASE and required by whoever needs it — the
	 * orchestrator is keyed by THREAD and structurally has none (its session row is the one with
	 * `issue_id IS NULL`).
	 */
	issueId: z.uuid().optional(),
	threadId: z.uuid(),
	/** The transcript entry that TRIGGERED this run, when one did. Absent on runs no message triggered. */
	entryId: z.uuid().optional(),
})

/** The confinement fields alone — what an agent's `IdentitySchema` produces. */
export type AgentRunIdentityFields = Z.output<typeof AgentRunIdentitySchema>

/**
 * What the issued token resolves back to. Extends the core FORMAT (`scope` + `expiresAt` + whatever
 * else the product carries) with this product's confinement axes and its two credential facts.
 *
 * Renamed from `RunTokenClaims` (spec decision 3): "claims" named the ENVELOPE, and there is no
 * envelope — the token is 32 random bytes and the fields never leave this process. What travels is a
 * lookup key; what this type describes is the IDENTITY the lookup returns.
 */
export interface AgentRunIdentity extends AgentIdentity, AgentRunIdentityFields {
	agentName: AgentName
	/**
	 * WHICH declared tool surface this credential opens — the AUTHORIZATION half.
	 *
	 * Without it a token is a bearer credential for the WHOLE MCP door: `IssueWorkAgent` is issued for
	 * `issue-handling` (six writes on its own issue) and the same bytes would authenticate a call
	 * against `/mcp/system` and its twenty-three operations — `CreateOwner`, `DisableOwner`,
	 * `AddWorkspace`, `RemoveWorkspace` among them. None of those carry a confinement axis in their
	 * arguments, so the comparison finds nothing to reject. The token rides on the child CLI's argv,
	 * readable by the very shell-capable model this design defends against, so "the agent only asks
	 * for its own scope" is not a property anyone can rely on. `--allowedTools` is the CLIENT-side
	 * half of the same rule; the SCOPE MATCH in the adapter is the server-side one, and only the
	 * server-side one is a boundary.
	 */
	scope: McpScope
	/** Short-lived: the run window plus grace. Expiry is a backstop; `revoke` is the primary. */
	expiresAt: Date
}

/**
 * WHAT `AgentIdentityMiddleware` STAMPS ON `ctx` — declared ONCE, composed by every controller that
 * reads it.
 *
 * ─────────────────────────────────────────────────────────────────────────────────────────────────
 * IT MUST BE DECLARED SOMEWHERE, AND THAT IS NOT A DESIGN CHOICE. `Controller.execute` validates the
 * whole request against `inputSchema` and merges the VALIDATED envelope over the raw one, and Zod
 * objects STRIP unknown keys — so a value a middleware injected but no schema named is silently
 * removed before `handle` ever sees it. That is not hypothetical: it cost a 500 on every fork, with
 * the middleware provably correct and the key simply gone.
 *
 * WHAT CHANGED IS THE COUNT. `ForkIssue` and `SteerIssueTurn` each carried their own verbatim copy
 * (`RunClaimsCtxSchema`), because there was nowhere shared to put it. There is now, and the third
 * controller that needs it composes instead of copying.
 *
 * OPTIONAL, because the middleware is NOT fail-closed: a `system` operation served to a human
 * operator carries no agent identity, and that is the normal case for 23 of the 32 exposed
 * controllers. A controller for which absence is a broken invariant says so in its own `handle()` —
 * which is where `ForkIssue` already rejects a run with no originating entry.
 * ─────────────────────────────────────────────────────────────────────────────────────────────────
 */
export const AgentRunIdentityCtxSchema = z.object({
	agentIdentity: z
		.object({
			ownerId: z.uuid(),
			issueId: z.uuid().optional(),
			threadId: z.uuid(),
			entryId: z.uuid().optional(),
			scope: z.enum(McpScope),
		})
		.optional(),
})
