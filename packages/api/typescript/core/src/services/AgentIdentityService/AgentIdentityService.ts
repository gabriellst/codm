import type { AgentIdentity } from '../../types/AgentIdentity'

/**
 * ISSUE / RESOLVE / REVOKE for the opaque token that carries a run's identity to the MCP door.
 *
 * ─────────────────────────────────────────────────────────────────────────────────────────────────
 * THREE VERBS, THREE DIFFERENT CALLERS — an invariant, not a style preference:
 *
 * | verb      | sole caller                      | why it and nobody else                             |
 * |-----------|----------------------------------|----------------------------------------------------|
 * | `issue`   | the base `Agent`, at spawn       | only layer holding the input envelope AND the request |
 * | `resolve` | the destination controller's     | authorization is a per-CALL boundary, not per-run   |
 * |           | `AgentIdentityMiddleware` + the  |                                                     |
 * |           | adapter's scope match            |                                                     |
 * | `revoke`  | the runner, at run end           | only it knows the process died (normal/error/cancel) |
 *
 * A runner that ISSUES would have to be handed the identity the seam exists to keep out of it.
 *
 * THE GENERIC IS FOR THE PRODUCT'S NARROWED TYPE, AND IT ERASES CLEANLY
 * `AgentIdentityService<AgentRunIdentity>` at an injection site gives the product its own fields back
 * from `resolve()`; tsyringe reads `design:paramtypes`, which carries the ERASED class, so the binding
 * is found by the same class token regardless of the argument. No cast anywhere.
 * ─────────────────────────────────────────────────────────────────────────────────────────────────
 */
export abstract class AgentIdentityService<I extends AgentIdentity = AgentIdentity> {
	/** Issue an opaque token for one run. Called EXCLUSIVELY by the base `Agent`. */
	abstract issue(identity: I): string

	/** Resolve a token to its identity, or `null` when unknown / expired / revoked. Per call. */
	abstract resolve(token: string): I | null

	/** Invalidate at run termination — normal, error or cancellation. Idempotent by contract. */
	abstract revoke(token: string): void
}
