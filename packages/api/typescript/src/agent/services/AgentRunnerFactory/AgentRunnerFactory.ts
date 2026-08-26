import { BaseError } from '@codm/core-typescript'
import type { BaseInfrastructureErrors } from '@codm/core-typescript'
import { ProviderKind } from '@codm/contracts-typescript/wire/enums'
// TYPE-only, and it must stay that way: this module is a LEAF on purpose. `services/AgentRunner`'s
// barrel reaches `agent/mcp/exposure.ts`, which imports `@ui/controllers` — so a VALUE import here
// would drag the whole `ui` context into every consumer of this token. The `ui` BFF reads inject this
// token (to answer "can we drive this CLI?", see `comingSoon`), and that import must not cycle back
// into `ui` and leave the class in the TDZ while decorators run. Implementations live in their own
// files beside this one for the same reason.
import type { AgentRunner } from '../AgentRunner'

/**
 * WHERE `ProviderKind` → RUNNER IS RESOLVED (Fase 4.5's rule, finally given a home).
 *
 * ### Why this exists at all, when the registry used to do it in one line
 * It used to be a direct binding: `{ token: AgentRunner, real: ClaudeAgentRunner }`, plus a flat
 * `RUNNER_SUPPORTED_PROVIDERS` const beside it that `RunIssueTurn` consulted before ever calling
 * `run()`. Two declarations of one fact, kept in step by hand — bind a second runner and the const
 * silently keeps saying claude-only. Here `supported` is DERIVED from the same map `for()` reads, so
 * the misrouting guard and the wiring cannot disagree.
 *
 * It also removes the last reason an AGENT had to hold a runner. With one bound runner, injecting it
 * into the agent's constructor was indistinguishable from resolving it; with a per-provider lookup it
 * is not — the provider is only known once a THREAD is in hand, which is request time, not container
 * time. So the runner travels as a parameter to `Agent.run()` and the agents keep no I/O at all.
 *
 * ### Why the seam stays provider-free
 * AC-4.5.3: no class under `services/AgentRunner` may name a `ProviderKind` — a runner that could
 * compare provider identities would be one branch away from being two runners in a trenchcoat. This
 * directory is the WIRING layer, deliberately its own sibling of the seam, and naming providers is
 * precisely its job. (Sibling rather than nested: `tests/architecture/pty-isolation.test.ts` allows
 * `services/AgentRunner/**` to spawn processes, and a nested factory would inherit that permission by
 * path prefix without ever needing it.)
 *
 * ### Bound per ENV, not `@injectable()`-and-done (founder decision A)
 * SVC-P13 says a factory over CONCRETE implementations needs no registry entry. That is true of the
 * `real` implementation (`DefaultAgentRunnerFactory`, in its own file beside this one) and it is why
 * that class injects `ClaudeAgentRunner` concretely. But the binding this factory REPLACES was also the env seam that makes "no test spawns a
 * provider CLI" a property of DI rather than of test discipline (§8 rule 8) — collapsing it into one
 * `@injectable()` class would push the `e2e`-vs-`real` branch inside a domain class. So the ABSTRACT
 * token below is bound per env in `agent/registry.ts`, and each env's factory is honest about the one
 * runner it can produce.
 */
export abstract class AgentRunnerFactory {
	/** Every provider this factory can drive. Derived from the map, never restated. */
	abstract readonly supported: readonly ProviderKind[]

	/**
	 * THE call site's entry point: the runner that drives `provider`, or a NAMED failure.
	 *
	 * Concrete on purpose — the guard used to live in `RunIssueTurn.resolveProvider` as an
	 * `includes()` against the flat const, and decision (2) gives it a second call site
	 * (`DefaultIssueRouter`). Two copies of one throw is how the two drift. Detection succeeding says
	 * only that a BINARY is installed: `PROVIDER_BINARIES` declares real `bin` names for codex and
	 * opencode so they appear correctly in `DetectProviders`, and `AttachThread` only checks
	 * installation — so a machine with the codex CLI on PATH can attach a thread declaring
	 * `providers: ['CODEX']`. Without this, that thread's turns would fall through to whichever runner
	 * happened to be bound and be driven by claude's argv, stream format and session semantics.
	 *
	 * `NOT_IMPLEMENTED` is core's EXISTING code for "this concrete implementation does not support the
	 * requested operation" — and the honest one: `PROVIDER_NOT_DETECTED` would tell the operator to
	 * install a binary that is already installed.
	 */
	for(provider: ProviderKind): AgentRunner {
		const runner = this.runnerFor(provider)
		if (!runner) {
			throw new BaseError<BaseInfrastructureErrors>(
				'NOT_IMPLEMENTED',
				`no AgentRunner implementation exists for provider ${provider} — the bound factory only drives ${this.supported.join(', ')}`,
			)
		}
		return runner
	}

	/** The ONE point of variation: the lookup itself. `undefined` ⇒ no runner class drives that CLI. */
	protected abstract runnerFor(provider: ProviderKind): AgentRunner | undefined

	/** Release every runner this factory owns. Idempotent. */
	abstract shutdown(): Promise<void>
}
