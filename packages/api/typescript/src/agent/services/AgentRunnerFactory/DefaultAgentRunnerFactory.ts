import { injectable } from 'tsyringe-neo'
import { ProviderKind } from '@codm/contracts-typescript/wire/enums'
import type { AgentRunner } from '../AgentRunner'
import { ClaudeAgentRunner, CodexAgentRunner } from '../AgentRunner'
import { AgentRunnerFactory } from './AgentRunnerFactory'

/**
 * The `real` factory. TWO entries, one per CLI that has a runner class.
 *
 * Both runners are injected by CONCRETE type (SVC-P13): neither is bound to a token, so this factory
 * is the only thing in the process that can produce one — which is what makes "the `real` env is the
 * only env that can spawn a CLI" true by construction rather than by a comment.
 *
 * The second CLI landed, and the change was exactly what the previous version of this docblock
 * predicted: "a constructor parameter and a map entry HERE, and still not a branch inside a runner".
 * No runner learned about the other, no `switch (provider)` appeared anywhere, and `supported` needed
 * no edit at all because it reads the map.
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

	constructor(claude: ClaudeAgentRunner, codex: CodexAgentRunner) {
		super()
		this.runners = new Map<ProviderKind, AgentRunner>([
			[ProviderKind.CLAUDE_CODE, claude],
			[ProviderKind.CODEX, codex],
		])
		// Derived HERE and not as a field initializer: those run before the constructor body, so the
		// field form read `runners` before it existed (`tsc` TS2729). Deriving after the assignment is
		// what keeps "never restated" true without reintroducing the ordering hazard.
		this.supported = [...this.runners.keys()]
	}

	/**
	 * DERIVED from the map, never restated — which is why adding codex above was the whole change.
	 *
	 * `supported` is what the `ui` BFF reads to decide `comingSoon`, so the console stopped offering
	 * codex as "coming soon" without a line of frontend code. The alternative this class was built to
	 * avoid is the flat const that used to live beside the binding: bind a second runner, forget the
	 * const, and the guard keeps saying claude-only while the wiring says otherwise.
	 */
	override readonly supported: readonly ProviderKind[]

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
