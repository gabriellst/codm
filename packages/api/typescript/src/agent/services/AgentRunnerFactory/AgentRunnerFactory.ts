import { injectable } from 'tsyringe-neo'
import { BaseError } from '@codm/core-typescript'
import type { BaseInfrastructureErrors } from '@codm/core-typescript'
import { ProviderKind } from '@codm/contracts-typescript/wire/enums'
import { AgentRunner, ClaudeAgentRunner } from '../AgentRunner'

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
 * `real` implementation below and it is why `DefaultAgentRunnerFactory` injects `ClaudeAgentRunner`
 * concretely. But the binding this factory REPLACES was also the env seam that makes "no test spawns a
 * provider CLI" a property of DI rather than of test discipline (§8 rule 8) — collapsing it into one
 * `@injectable()` class would push `process.env.CODEDM_E2E` inside a domain class. So the ABSTRACT
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

/**
 * The `real` factory. ONE entry today, because exactly one CLI has a runner class.
 *
 * `ClaudeAgentRunner` is injected by CONCRETE type (SVC-P13): it is no longer bound to any token, so
 * this factory is the only thing in the process that can produce one — which is what makes "the `real`
 * env is the only env that can spawn a CLI" true by construction rather than by a comment.
 *
 * A second CLI landing (Fase 6+) adds a constructor parameter and a map entry HERE, and still not a
 * branch inside a runner.
 */
@injectable()
export class DefaultAgentRunnerFactory extends AgentRunnerFactory {
	private readonly runners: ReadonlyMap<ProviderKind, AgentRunner>

	constructor(claude: ClaudeAgentRunner) {
		super()
		this.runners = new Map<ProviderKind, AgentRunner>([[ProviderKind.CLAUDE_CODE, claude]])
	}

	override readonly supported: readonly ProviderKind[] = [ProviderKind.CLAUDE_CODE]

	protected runnerFor(provider: ProviderKind): AgentRunner | undefined {
		return this.runners.get(provider)
	}

	/**
	 * Kill every live provider PROCESS GROUP — the daemon's `shutdown` step (`src/index.ts`) resolves
	 * THIS token now that `AgentRunner` is not a token at all. The factory is a container SINGLETON, so
	 * the runners it hands out are the same instances that hold the processes; a transient binding here
	 * would hand shutdown a freshly-built runner owning nothing while the real children outlived the
	 * daemon.
	 */
	async shutdown(): Promise<void> {
		await Promise.all([...this.runners.values()].map(runner => runner.shutdown()))
	}
}
