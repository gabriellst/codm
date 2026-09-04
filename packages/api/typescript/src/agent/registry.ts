// Per-env DI bindings for the `agent` context (the agent runtime).
import './errors' // Side-effect: registers this context's error codes with the framework runtime registry.

import type { DependencyContainer } from 'tsyringe-neo'
import { type InstanceRegistry, expandBindings, HEALTH_CHECKS, PollingHealthCheck, resolve, asPollingService } from '@codm/core-typescript'
import { AgentRunnerFactory, DefaultAgentRunnerFactory, StubAgentRunnerFactory, E2eAgentRunnerFactory } from './services/AgentRunnerFactory'
import { ProviderDetector, MockProviderDetector, SystemProviderDetector } from './services/ProviderDetector'
import { McpConfigDiscovery, MockMcpConfigDiscovery, SystemMcpConfigDiscovery } from './services/McpConfigDiscovery'
import { AgentStreamRegistry } from './services/AgentStreamRegistry'
import { AgentScenarioSelection } from './services/AgentScenario'
import { MailboxDispatcher, LibSqlMailboxDispatcher } from './services/MailboxDispatcher'
import { IssueWorkAgent, IssueWorkPromptBuilder } from './agents/IssueWorkAgent'
import { OrchestratorAgent, OrchestratorPromptBuilder } from './agents/OrchestratorAgent'
import { AgentSessionRepository, LibSqlAgentSessionRepository, MockAgentSessionRepository } from './repositories/AgentSessionRepository'
import { LibSqlMailboxRepository, MailboxRepository, MockMailboxRepository } from './repositories/MailboxRepository'
import { McpServerRepository, LibSqlMcpServerRepository, MockMcpServerRepository } from './repositories/McpServerRepository'
import {
	McpToolApprovalRepository,
	LibSqlMcpToolApprovalRepository,
	MockMcpToolApprovalRepository,
} from './repositories/McpToolApprovalRepository'
import { StalledIssueReader, LibSqlStalledIssueReader, MockStalledIssueReader } from './services/StalledIssueReader'
import { McpUpstreamRegistry, DefaultMcpUpstreamRegistry, MockMcpUpstreamRegistry } from './services/McpUpstreamRegistry'

// E2E HERMETIC SEAM (see shared/registry.ts + src/boot.ts). The Playwright harness boots the REAL
// daemon but must never spawn a provider CLI or probe host PATH: under the `e2e` boot environment
// (`CODM_ENV=e2e`) the AgentRunnerFactory drops to one over a deterministic stub (NEW_ISSUE decision +
// canned reply frames, no subprocess) and the ProviderDetector drops to the canned catalog (claude-code
// DETECTED), so AttachThread's provider check and the inbound → classify → session → reply chain run
// without a host toolchain. Production (`real`) keeps DefaultAgentRunnerFactory over ClaudeAgentRunner
// (bidirectional stream-json over plain pipes) + SystemProviderDetector — the swap is a DECLARED `e2e`
// column below (T5, NN-5), never a raw-flag `if`.

const mailboxDispatcherHealthCheck = {
	useFactory: (c: DependencyContainer) =>
		new PollingHealthCheck('mailboxDispatcher', () => asPollingService('mailboxDispatcher', resolve(c, MailboxDispatcher))),
}

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
	{
		token: AgentRunnerFactory,
		mock: StubAgentRunnerFactory,
		integration: StubAgentRunnerFactory,
		real: DefaultAgentRunnerFactory,
		e2e: E2eAgentRunnerFactory,
	},
	// CLI detection: canned catalog in tests, PATH/install-dir probing in `real`.
	{
		token: ProviderDetector,
		mock: MockProviderDetector,
		integration: MockProviderDetector,
		real: SystemProviderDetector,
		e2e: MockProviderDetector,
	},
	// Descoberta de configuração MCP existente: o `real` lê os arquivos declarados em `fileSources`;
	// todo o resto NUNCA toca disco. Sem essa coluna, um teste de import passaria a depender de quais
	// arquivos existem na máquina que o roda — e medido em 04/09/2026, três das quatro fontes estavam
	// ausentes aqui, então o verde viria da ausência e esconderia um parser quebrado.
	{
		token: McpConfigDiscovery,
		mock: MockMcpConfigDiscovery,
		integration: MockMcpConfigDiscovery,
		real: SystemMcpConfigDiscovery,
		e2e: MockMcpConfigDiscovery,
	},
	// The adopted whatscode AgentStreamRegistry (Fork C): SSE observer channel + the absorbed
	// single-active-run guard — one shared in-memory instance per process.
	{ token: AgentStreamRegistry, mock: AgentStreamRegistry, integration: AgentStreamRegistry, real: AgentStreamRegistry },
	// WHICH roteiro the deterministic stand-in performs. Bound in EVERY column, not only `e2e`: the
	// door that writes it is `e2e`-only, so everywhere else this resolves to a constant reporting the
	// default. A token bound in one column and absent from the others is how a resolve throws in
	// production for a reason invisible at the call site.
	{
		token: AgentScenarioSelection,
		mock: AgentScenarioSelection,
		integration: AgentScenarioSelection,
		real: AgentScenarioSelection,
	},
	// Durable per-issue session record (Fork B): resume identity + last-turn recency.
	{
		token: AgentSessionRepository,
		mock: MockAgentSessionRepository,
		integration: LibSqlAgentSessionRepository,
		real: LibSqlAgentSessionRepository,
	},
	// The durable per-target turn queue. Producers enqueue inside their own transaction; the
	// dispatcher is the single consumer and holds one lease per target.
	{ token: MailboxRepository, mock: MockMailboxRepository, integration: LibSqlMailboxRepository, real: LibSqlMailboxRepository },
	// Third-party MCP servers the owner registered on this machine (Task T3).
	{ token: McpServerRepository, mock: MockMcpServerRepository, integration: LibSqlMcpServerRepository, real: LibSqlMcpServerRepository },
	// The owner's decision on ONE external tool call — PENDING/APPROVED/DENIED (Task T7).
	{
		token: McpToolApprovalRepository,
		mock: MockMcpToolApprovalRepository,
		integration: LibSqlMcpToolApprovalRepository,
		real: LibSqlMcpToolApprovalRepository,
	},
	// The daemon as an MCP CLIENT (Task T5). `integration` binds the MOCK on purpose — a test cannot
	// depend on a third-party MCP server being installed on the CI machine.
	{ token: McpUpstreamRegistry, mock: MockMcpUpstreamRegistry, integration: MockMcpUpstreamRegistry, real: DefaultMcpUpstreamRegistry },
	// A varredura de issues órfãs lê a tabela `issues` a partir daqui — mesmo padrão de
	// `thread/services/OpenIssuesReader`. `integration` usa a implementação REAL de propósito: o teste do
	// job existe para exercitar o predicado das duas filas contra o banco, e um mock o tornaria vazio.
	{
		token: StalledIssueReader,
		mock: MockStalledIssueReader,
		integration: LibSqlStalledIssueReader,
		real: LibSqlStalledIssueReader,
	},
	// The SINGLE consumer of the mailbox (§7.4). Bound in all three envs so a test can `drain()` on
	// demand; only `real` ever has `start()` called on it, from the boot sequence — a poller running
	// under a test suite would race every assertion in it.
	{ token: MailboxDispatcher, mock: LibSqlMailboxDispatcher, integration: LibSqlMailboxDispatcher, real: LibSqlMailboxDispatcher },
	// O contexto que POSSUI o dispatcher possui o check dele. Uma declaração a mais do token de
	// multi-inject `HEALTH_CHECKS` — todo registry de contexto é aplicado ao MESMO rootContainer
	// (`BoundedContext.create`), então este check é agregado junto com os do shared por `resolveAll`.
	// `e2e` declares the SAME check as `real` (hoisted to one value so the two columns cannot drift):
	// the harness is a real boot with a real MailboxDispatcher polling, so `/health` must report on
	// it there too. Inheriting `integration`'s declared absence would have silently dropped it.
	{ token: HEALTH_CHECKS, mock: null, integration: null, real: mailboxDispatcherHealthCheck, e2e: mailboxDispatcherHealthCheck },
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
