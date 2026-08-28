import { describe, expect, it } from 'bun:test'
import { container, injectable } from 'tsyringe-neo'
import { registerAll } from '@codm/core-typescript'
import { ProviderKind } from '@codm/contracts-typescript/wire/enums'
import { LIBSQL_DB_REGISTRY } from '@shared/registry'
import { ALL_REGISTRIES } from '@generated/registries.generated'
import { AgentRunnerFactory } from '@agent/services/AgentRunnerFactory'
import { ClaudeAgentRunner, CodexAgentRunner } from '@agent/services/AgentRunner'
import { IssueWorkAgent } from '@agent/agents/IssueWorkAgent'
import { OrchestratorAgent } from '@agent/agents/OrchestratorAgent'
import { MailboxDispatcher } from '@agent/services/MailboxDispatcher'
// By FILE, never the `controllers` barrel — the barrel pulls in every other controller in the
// context, and `MailboxDispatcher` (constructed above, same container) sits behind a cycle through
// it. `McpDoorController` is reached the same way production reaches it: outside the barrel (B2 T8),
// resolved by class token alone.
import { McpDoorController } from '@agent/mcp/door'

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
 * Nothing built the class. `mock`/`integration` bind stubs, the `e2e` DI column swaps in a stub, and the unit
 * tests construct runners by hand with `new`. PRODUCTION WAS THE ONLY CALLER THAT WENT THROUGH THE
 * CONTAINER — which makes a `real`-only binding a permanent blind spot unless something resolves it on
 * purpose. This file is that something.
 *
 * ### Why the agent runtime and not every context (said out loud rather than half-built)
 * Registration is lazy; RESOLUTION is what constructs. The agent graph below reaches nothing but
 * in-memory collaborators, so resolving it is free and side-effect-free. Extending this to the
 * repository and driver bindings would construct `LibSqlDriver` against the REAL database path from
 * `Config` — a test that creates or opens the user's production store. That wants a `real`-shaped
 * driver pointed at a temp file, which is a separate piece of work; until then the rail covers the
 * subtree that actually had a `real`-only binding, and says so.
 */
describe('real-env DI resolution — the bindings no other test ever constructs', () => {
	const realContainer = () => {
		const child = container.createChildContainer()
		// A família é ESCOLHIDA aqui, como em todo sítio que monta sem compor (ver TestBed).
		registerAll(child, [...ALL_REGISTRIES.real, ...LIBSQL_DB_REGISTRY.real])
		return child
	}

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

	// B2 T8 measured: `biome check --write --unsafe` deletes a DI-carrying constructor silently
	// (`noUselessConstructor` is an unsafe autofix that fires even though the rule never reports at
	// error level). Deleted, `container.resolve(McpDoorController)` does NOT throw — the container
	// happily hands back an instance with `identities` `undefined`, because tsyringe only fails to
	// resolve a param it CAN'T type; a class with no declared constructor asks for none. `.not.toThrow()`
	// would be a VACUOUS gate for this exact defect (measured against this file before landing it —
	// deleting the constructor left `4 pass / 0 fail` unchanged). The constructed field is the only
	// place the failure is observable, which is exactly what the door's own docstring names.
	it('resolves McpDoorController WITH identities actually injected — the door biome silently gutted once', () => {
		const instance = realContainer().resolve(McpDoorController) as unknown as { identities: unknown }
		expect(instance.identities).toBeDefined()
	})

	it('the resolved factory yields both implemented runners and refuses a CLI with no runner class', () => {
		const factory = realContainer().resolve(AgentRunnerFactory as never) as AgentRunnerFactory

		// The POINT of resolving: the concrete runner is reachable only through this factory now, so this
		// line is the only thing in the suite that builds it the way production does. `real` no longer
		// branches on a raw flag (T5, eixo-único-de-ambiente) — the hermetic stub swap moved to its own
		// `e2e` DI column (agent/registry.ts), so `ALL_REGISTRIES.real` always yields the production
		// runner here.
		expect(factory.for(ProviderKind.CLAUDE_CODE)).toBeInstanceOf(ClaudeAgentRunner)
		expect(factory.for(ProviderKind.CODEX)).toBeInstanceOf(CodexAgentRunner)
		expect(factory.supported).toEqual([ProviderKind.CLAUDE_CODE, ProviderKind.CODEX])
		expect(() => factory.for(ProviderKind.OPENCODE)).toThrow(/no AgentRunner implementation exists/)
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
