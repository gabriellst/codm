import { injectable } from 'tsyringe-neo'
import { ProviderKind } from '@codm/contracts-typescript/wire/enums'
import type { AgentRunner } from '../AgentRunner'
import { E2eStubAgentRunner, StubAgentRunner } from '../AgentRunner'
import { AgentRunnerFactory } from './AgentRunnerFactory'

/**
 * Which providers a stand-in runner answers for. The stubs stand in for `ClaudeAgentRunner`
 * specifically — NOT for "any provider": `RunIssueTurn.test.ts` asserts that a thread declaring CODEX
 * is rejected with `NOT_IMPLEMENTED` while the ordinary stub stays bound, which is what proves the
 * misrouting guard lives in the wiring layer rather than in the runner. A factory that answered every
 * `ProviderKind` would make that test pass for the wrong reason — by never reaching the guard.
 */
const STANDS_IN_FOR: readonly ProviderKind[] = [ProviderKind.CLAUDE_CODE]

/**
 * A factory over ONE given runner — the shape every non-production env wants, and the double a test
 * reaches for: `testBed.override(AgentRunnerFactory, new FixedAgentRunnerFactory(myStubRunner))`.
 *
 * It is the direct replacement for what `testBed.override(AgentRunner, …)` used to do. That override
 * worked because `AgentRunner` was a token; with the lookup moved into a factory, swapping the runner
 * means swapping the thing that produces it. Deliberately NOT `@injectable()` — it takes a runner
 * INSTANCE, which is exactly what a container cannot supply and exactly what a test always has.
 */
export class FixedAgentRunnerFactory extends AgentRunnerFactory {
	readonly supported: readonly ProviderKind[] = STANDS_IN_FOR

	constructor(private readonly runner: AgentRunner) {
		super()
	}

	protected runnerFor(provider: ProviderKind): AgentRunner | undefined {
		return this.supported.includes(provider) ? this.runner : undefined
	}

	async shutdown(): Promise<void> {
		await this.runner.shutdown()
	}
}

/**
 * The factory bound in `mock` and `integration` — canned frames, never a process (§8 rule 8).
 *
 * `@injectable()` over the CONCRETE `StubAgentRunner`, which is no longer bound to any token: the
 * env's choice of runner is now expressed by which FACTORY the registry binds, and there is exactly
 * one declaration of it per env instead of a token plus a const.
 *
 * ### The constructor below is NOT redundant, whatever a formatter says
 * `biome check --write --unsafe` deleted it once (`noUselessConstructor`) while this file was being
 * written, and the deletion type-checks: the body only forwards. But the PARAMETER TYPE is the entire
 * DI binding — with the constructor gone, tsyringe reads the base's signature and tries to resolve the
 * ABSTRACT `AgentRunner`, which is bound to nothing. That is a silent rebind of the same family as the
 * defect this whole factory exists to close, so the suppression is deliberate and stays.
 */
@injectable()
export class StubAgentRunnerFactory extends FixedAgentRunnerFactory {
	// biome-ignore lint/complexity/noUselessConstructor: the parameter TYPE is the DI binding — see above.
	constructor(runner: StubAgentRunner) {
		super(runner)
	}
}

/**
 * The factory bound in the `e2e` DI column — the Playwright harness boots the REAL daemon over the
 * real SQLite and must never spawn a provider CLI, so the hermetic seam swaps the FACTORY rather than
 * the runner. Declared as its own column in `agent/registry.ts`, alongside the `real` one.
 */
@injectable()
export class E2eAgentRunnerFactory extends FixedAgentRunnerFactory {
	// biome-ignore lint/complexity/noUselessConstructor: the parameter TYPE is the DI binding — see StubAgentRunnerFactory.
	constructor(runner: E2eStubAgentRunner) {
		super(runner)
	}
}
