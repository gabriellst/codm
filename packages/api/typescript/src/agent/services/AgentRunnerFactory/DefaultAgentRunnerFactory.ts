import { injectable } from 'tsyringe-neo'
import { ProviderKind } from '@codm/contracts-typescript/wire/enums'
import type { AgentRunner } from '../AgentRunner'
import { ClaudeAgentRunner } from '../AgentRunner'
import { AgentRunnerFactory } from './AgentRunnerFactory'

/**
 * The `real` factory. ONE entry today, because exactly one CLI has a runner class.
 *
 * `ClaudeAgentRunner` is injected by CONCRETE type (SVC-P13): it is no longer bound to any token, so
 * this factory is the only thing in the process that can produce one — which is what makes "the `real`
 * env is the only env that can spawn a CLI" true by construction rather than by a comment.
 *
 * A second CLI landing (Fase 6+) adds a constructor parameter and a map entry HERE, and still not a
 * branch inside a runner.
 *
 * ### Why this lives beside the abstract token rather than inside its file
 * It is the same split `ProviderDetector/` already uses (abstract seam in `ProviderDetector.ts`, each
 * implementation in its own file), and here it is load-bearing rather than cosmetic. Importing a
 * runner IMPLEMENTATION drags `services/AgentRunner`'s barrel in, and that barrel reaches
 * `agent/mcp/exposure.ts`, which imports `@ui/controllers` — so any module that pulls this file also
 * pulls the entire `ui` context. `AgentRunnerFactory.ts` must stay free of that: `ui` reads inject the
 * abstract token to answer "can we drive this CLI?", and with the implementation in the same file the
 * import cycled back through `ui/controllers` and left the token in the TDZ at decoration time.
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
