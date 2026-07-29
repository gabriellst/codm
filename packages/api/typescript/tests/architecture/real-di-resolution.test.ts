import { describe, expect, it } from 'bun:test'
import { container, injectable } from 'tsyringe-neo'
import { registerAll } from '@codedm/core-typescript'
import { ProviderKind } from '@codedm/contracts-typescript/wire/enums'
import { ALL_REGISTRIES } from '@shared/registry'
import { AgentRunnerFactory } from '@agent/services/AgentRunnerFactory'
import { ClaudeAgentRunner, E2eStubAgentRunner } from '@agent/services/AgentRunner'
import { IssueWorkAgent, OrchestratorAgent } from '@agent/agents'
import { MailboxDispatcher } from '@agent/services'

/**
 * THE RAIL THAT WAS MISSING ON 28-JUL-2026, written the day the bug it would have caught was found.
 *
 * `ClaudeAgentRunner`'s constructor ended in `options: ClaudeAgentRunnerOptions = {}`. tsyringe
 * introspects EVERY constructor parameter, including a defaulted one; the emitted `design:paramtype`
 * for a plain object is `Object`, and resolving `Object` throws `TypeInfo not known for "Object"`.
 * `Mediator.register` CATCHES that, logs `Failed to resolve Handler …`, decrements a counter and
 * carries on — so `ConsumeInboundMessage` and `RunIssueTurnOnClassification` were never registered,
 * `SqlExternalMediator` claims only outbox rows whose event name has a REGISTERED handler, and every
 * inbound WhatsApp message sat at `attempts = 0` forever. No error, no retry, no symptom.
 *
 * ### Why every existing gate stayed green
 * Nothing built the class. `mock`/`integration` bind stubs, `CODEDM_E2E` swaps in a stub, and the unit
 * tests construct runners by hand with `new`. PRODUCTION WAS THE ONLY CALLER THAT WENT THROUGH THE
 * CONTAINER — which makes a `real`-only binding a permanent blind spot unless something resolves it on
 * purpose. This file is that something.
 *
 * ### Why the agent runtime and not every context (said out loud rather than half-built)
 * Registration is lazy; RESOLUTION is what constructs. The agent graph below reaches nothing but
 * in-memory collaborators, so resolving it is free and side-effect-free. Extending this to the
 * repository and driver bindings would construct `LibsqlDriver` against the REAL database path from
 * `Config` — a test that creates or opens the user's production store. That wants a `real`-shaped
 * driver pointed at a temp file, which is a separate piece of work; until then the rail covers the
 * subtree that actually had a `real`-only binding, and says so.
 */
describe('real-env DI resolution — the bindings no other test ever constructs', () => {
	const realContainer = () => {
		const child = container.createChildContainer()
		registerAll(child, ALL_REGISTRIES.real)
		return child
	}

	// The agent graph is bound in `real` by `agent/registry.ts`, whose E2E ternary reads the env at
	// module load: under `CODEDM_E2E=true` the `real` column deliberately holds the hermetic stub. The
	// flag is therefore read and ASSERTED AGAINST rather than used to skip — a rail that opts out under
	// a flag is a rail that proves nothing in exactly the configuration CI runs Playwright in.
	const hermetic = process.env.CODEDM_E2E === 'true'

	/**
	 * The graph the pivot left behind: the classifier and the router are gone, and the ORCHESTRATOR and
	 * the dispatcher took their place. Resolving the dispatcher is the load-bearing one — it is the only
	 * consumer of the mailbox, so a DI break there means messages queue and nothing ever runs them,
	 * which looks exactly like a quiet conversation rather than a broken boot.
	 */
	it('resolves the whole agent graph — factory, both agents and the dispatcher', () => {
		const child = realContainer()
		expect(() => child.resolve(AgentRunnerFactory as never)).not.toThrow()
		expect(() => child.resolve(IssueWorkAgent)).not.toThrow()
		expect(() => child.resolve(OrchestratorAgent)).not.toThrow()
		expect(() => child.resolve(MailboxDispatcher as never)).not.toThrow()
	})

	it('the resolved factory yields the runner its env promises, and refuses a CLI with no runner class', () => {
		const factory = realContainer().resolve(AgentRunnerFactory as never) as AgentRunnerFactory

		// The POINT of resolving: the concrete runner is reachable only through this factory now, so this
		// line is the only thing in the suite that builds it the way production does.
		expect(factory.for(ProviderKind.CLAUDE_CODE)).toBeInstanceOf(hermetic ? E2eStubAgentRunner : ClaudeAgentRunner)
		expect(factory.supported).toEqual([ProviderKind.CLAUDE_CODE])
		// The misrouting guard, at the layer that owns it: codex is DETECT-ONLY, so a thread declaring it
		// must be refused by the WIRING rather than silently driven by claude's argv and stream parser.
		expect(() => factory.for(ProviderKind.CODEX)).toThrow(/no AgentRunner implementation exists/)
	})

	/**
	 * NEGATIVE FIXTURE — the rail above is worthless unless it can go red, and the thing it must go red
	 * for is a shape that LOOKS harmless. This reproduces the exact 28-jul defect in miniature: a plain
	 * object parameter WITH A DEFAULT, on an `@injectable()` class. TypeScript is perfectly happy, the
	 * class is constructible by hand, and only the container objects.
	 *
	 * Keep this test passing and you keep the diagnosis; delete it and the next person re-derives it
	 * from an inert product.
	 */
	it('fixture: an @injectable() class with a defaulted plain-object parameter is UNRESOLVABLE', () => {
		interface Options {
			timeoutMs?: number
		}

		@injectable()
		class LooksFine {
			constructor(public readonly options: Options = {}) {}
		}

		// By hand: fine. This is why a unit test never notices.
		expect(new LooksFine().options).toEqual({})
		// Through the container: `design:paramtypes` emitted `Object`, and `Object` has no TypeInfo.
		expect(() => container.createChildContainer().resolve(LooksFine)).toThrow(/TypeInfo not known/)
	})
})
