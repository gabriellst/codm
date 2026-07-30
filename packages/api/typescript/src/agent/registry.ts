// Per-env DI bindings for the `agent` context (the agent runtime).
import './errors' // Side-effect: registers this context's error codes with the framework runtime registry.

import type { DependencyContainer } from 'tsyringe-neo'
import { type InstanceRegistry, expandBindings, HEALTH_CHECKS, PollingHealthCheck } from '@codm/core-typescript'
import { AgentRunnerFactory, DefaultAgentRunnerFactory, StubAgentRunnerFactory, E2eAgentRunnerFactory } from './services/AgentRunnerFactory'
import { ProviderDetector, MockProviderDetector, SystemProviderDetector } from './services/ProviderDetector'
import { AgentStreamRegistry } from './services/AgentStreamRegistry'
import { MailboxDispatcher, DrizzleMailboxDispatcher } from './services/MailboxDispatcher'
import { IssueWorkAgent, IssueWorkPromptBuilder, OrchestratorAgent, OrchestratorPromptBuilder } from './agents'
import {
	AgentSessionRepository,
	DrizzleAgentSessionRepository,
	DrizzleMailboxRepository,
	MailboxRepository,
	MockAgentSessionRepository,
	MockMailboxRepository,
} from './repositories'

// E2E HERMETIC SEAM (see shared/registry.ts + src/boot.ts). The Playwright harness boots the REAL
// daemon but must never spawn a provider CLI or probe host PATH: under CODEDM_E2E the `real`
// AgentRunnerFactory drops to one over a deterministic stub (NEW_ISSUE decision + canned reply
// frames, no subprocess) and the `real` ProviderDetector drops to the canned catalog (claude-code
// DETECTED), so AttachThread's provider check and the inbound → classify → session → reply chain run
// without a host toolchain. Production (flag unset) keeps DefaultAgentRunnerFactory over
// ClaudeAgentRunner (bidirectional stream-json over plain pipes) + SystemProviderDetector.
const E2E = process.env.CODEDM_E2E === 'true'
const realRunnerFactory = E2E ? E2eAgentRunnerFactory : DefaultAgentRunnerFactory
const realProviderDetector = E2E ? MockProviderDetector : SystemProviderDetector

export const INSTANCE_REGISTRY: InstanceRegistry = expandBindings([
	// WHERE `ProviderKind` → RUNNER IS RESOLVED (Fase 4.5's rule; the factory is where it finally
	// lives). One class per CLI means the choice of CLI is a WIRING decision — which is why no runner
	// takes a provider, no request carries one, and AC-4.5.3 can demand zero provider-identity branches
	// inside `services/AgentRunner`. What changed is only WHEN the choice is made: the container knows
	// which runners EXIST, but which one drives a given turn is `thread.providers[0]`, known at request
	// time. So the container binds the lookup and the caller performs it (`AgentRunnerFactory.for`).
	//
	// The `AgentRunner` seam itself is deliberately NOT a token any more. It was one, with a flat
	// `RUNNER_SUPPORTED_PROVIDERS` const beside it that `RunIssueTurn` consulted — a second declaration
	// of the same fact, with nothing keeping the two in step. `ClaudeAgentRunner` is now reachable only
	// through `DefaultAgentRunnerFactory`, which is what keeps §8 rule 8 ("no test spawns a provider
	// CLI") a property of the DI ENV: the `real` column is the only one that can produce one.
	//
	// A test swaps the FACTORY, not the runner: `testBed.override(AgentRunnerFactory, new
	// FixedAgentRunnerFactory(myStub))`.
	{ token: AgentRunnerFactory, mock: StubAgentRunnerFactory, integration: StubAgentRunnerFactory, real: realRunnerFactory },
	// CLI detection: canned catalog in tests, PATH/install-dir probing in `real`.
	{ token: ProviderDetector, mock: MockProviderDetector, integration: MockProviderDetector, real: realProviderDetector },
	// The adopted whatscode AgentStreamRegistry (Fork C): SSE observer channel + the absorbed
	// single-active-run guard — one shared in-memory instance per process.
	{ token: AgentStreamRegistry, mock: AgentStreamRegistry, integration: AgentStreamRegistry, real: AgentStreamRegistry },
	// Durable per-issue session record (Fork B): resume identity + last-turn recency.
	{
		token: AgentSessionRepository,
		mock: MockAgentSessionRepository,
		integration: DrizzleAgentSessionRepository,
		real: DrizzleAgentSessionRepository,
	},
	// The durable per-target turn queue. Producers enqueue inside their own transaction; the
	// dispatcher is the single consumer and holds one lease per target.
	{ token: MailboxRepository, mock: MockMailboxRepository, integration: DrizzleMailboxRepository, real: DrizzleMailboxRepository },
	// The SINGLE consumer of the mailbox (§7.4). Bound in all three envs so a test can `drain()` on
	// demand; only `real` ever has `start()` called on it, from the boot sequence — a poller running
	// under a test suite would race every assertion in it.
	{ token: MailboxDispatcher, mock: DrizzleMailboxDispatcher, integration: DrizzleMailboxDispatcher, real: DrizzleMailboxDispatcher },
	// O contexto que POSSUI o dispatcher possui o check dele. Uma declaração a mais do token de
	// multi-inject `HEALTH_CHECKS` — todo registry de contexto é aplicado ao MESMO rootContainer
	// (`BoundedContext.create`), então este check é agregado junto com os do shared por `resolveAll`.
	{
		token: HEALTH_CHECKS,
		mock: null,
		integration: null,
		real: {
			useFactory: (c: DependencyContainer) =>
				new PollingHealthCheck('mailboxDispatcher', c.resolve(MailboxDispatcher as any) as DrizzleMailboxDispatcher),
		},
	},
	// ── The internal agents (§4.8) ────────────────────────────────────────────────────────────────
	//
	// CLASS TOKENS, same implementation in all three envs — an agent has no mock/real split because it
	// holds no I/O of its own. It does not even hold a REFERENCE to the thing that does: the runner
	// arrives as a parameter to `run()`, resolved by the caller from the factory above. That is what
	// keeps "no test spawns a CLI" a property of the DI env (§8 rule 8) while the agents under test stay
	// the real ones.
	//
	// There is deliberately NO `AgentName`→agent map and no factory OVER AGENTS. `AgentName` is
	// identity — the label on a log line, a span and a run-token claim — never a resolution key;
	// resolution is `container.resolve(IssueWorkAgent)`, which a rename breaks at compile time instead
	// of at runtime. AC-5.3 greps for exactly that absence. (This says nothing about
	// `AgentRunnerFactory` above, which resolves `ProviderKind`→RUNNER: a `ProviderKind` is a closed
	// wire enum whose values are the product's supported CLIs, not a stringly-typed label for a class.)
	// TRANSIENT (`useClass`), not singleton, and the reason survives the runner leaving the constructor:
	// an agent holds nothing but its prompt builder, so a singleton buys no shared state, while it WOULD
	// capture whichever `AgentIdentityService` and builder were bound at first construction — and
	// `TestBed.override` swaps bindings per suite. One allocation per resolve, and the graph stays honest.
	{ token: IssueWorkPromptBuilder, mock: { useClass: IssueWorkPromptBuilder }, real: { useClass: IssueWorkPromptBuilder } },
	{ token: IssueWorkAgent, mock: { useClass: IssueWorkAgent }, real: { useClass: IssueWorkAgent } },
	{ token: OrchestratorPromptBuilder, mock: { useClass: OrchestratorPromptBuilder }, real: { useClass: OrchestratorPromptBuilder } },
	{ token: OrchestratorAgent, mock: { useClass: OrchestratorAgent }, real: { useClass: OrchestratorAgent } },
	//
	// The run credential is NOT bound here. `AgentIdentityService` is a CORE token and lives on the
	// ROOT shelf in `shared/registry.ts` — see the comment there for the mechanical reason
	// (`Controller.executeMiddlewares` resolves from the root container).
])
