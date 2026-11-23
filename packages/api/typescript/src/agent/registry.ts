// Per-env DI bindings for the `agent` context (the agent runtime).
import './errors' // Side-effect: registers this context's error codes with the framework runtime registry.

import type { DependencyContainer } from 'tsyringe-neo'
import { type InstanceRegistry, expandBindings, HEALTH_CHECKS, PollingHealthCheck, resolve, asPollingService } from '@codm/core-typescript'
import { AgentRunnerFactory, DefaultAgentRunnerFactory, StubAgentRunnerFactory, E2eAgentRunnerFactory } from './services/AgentRunnerFactory'
import { ProviderDetector, MockProviderDetector, SystemProviderDetector } from './services/ProviderDetector'
import { AgentStreamRegistry } from './services/AgentStreamRegistry'
import { IssueTurnAborter } from './services/IssueTurnAborter'
import { ImmediateRegretWindowClock, RegretWindowClock, TimerRegretWindowClock } from './services/RegretWindowClock'
import { AgentScenarioSelection } from './services/AgentScenario'
import { MailboxDispatcher, LibSqlMailboxDispatcher } from './services/MailboxDispatcher'
import { IssueWorkAgent, IssueWorkPromptBuilder } from './agents/IssueWorkAgent'
import { OrchestratorAgent, OrchestratorPromptBuilder } from './agents/OrchestratorAgent'
import { TriageAgent, TriagePromptBuilder } from './agents/TriageAgent'
import { InboundTriage, ModelInboundTriage, NoInboundTriage } from './services/InboundTriage'
import { AgentSessionRepository, LibSqlAgentSessionRepository, MockAgentSessionRepository } from './repositories/AgentSessionRepository'
import { LibSqlMailboxRepository, MailboxRepository, MockMailboxRepository } from './repositories/MailboxRepository'
import { IssueSequence, LibSqlIssueSequence, MockIssueSequence } from './services/IssueSequence'
import {
	IssueAttributesRepository,
	LibSqlIssueAttributesRepository,
	MockIssueAttributesRepository,
} from './repositories/IssueAttributesRepository'
import { StalledIssueReader, LibSqlStalledIssueReader, MockStalledIssueReader } from './services/StalledIssueReader'
import { DeclaredWaitReader, LibSqlDeclaredWaitReader, MockDeclaredWaitReader } from './services/DeclaredWaitReader'
import { AttributesForkedIssueReader, ForkedIssueReader } from './services/ForkedIssueReader'
import { GitWorktreeProbe, MockGitWorktreeProbe, SystemGitWorktreeProbe } from './services/GitWorktreeProbe'
import { ProcessPublishCommandRunner, PublishCommandRunner, ScriptedPublishCommandRunner } from './services/PublishCommandRunner'
import { HandoffNotes, LibSqlHandoffNotes, MockHandoffNotes } from './services/HandoffNotes'
import { WorktreeSightings } from './services/WorktreeSightings'
import { FactTriageUsageRecorder, TriageUsageRecorder } from './services/TriageUsageRecorder'
import { LibSqlQuotaLedgerReader, MockQuotaLedgerReader, QuotaLedgerReader } from './services/QuotaBudget'
import { IssueWorktreeJanitor } from './services/IssueWorktreeJanitor'
import { FixedMachineCapacity, MachineCapacity, SystemMachineCapacity } from './services/MachineCapacity'
import { InMemoryQuotaStatus, QuotaStatusReader } from './services/QuotaStatusReader'
import { ThroughputGate } from './services/ThroughputGate'

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
	// The adopted whatscode AgentStreamRegistry (Fork C): SSE observer channel + the absorbed
	// single-active-run guard — one shared in-memory instance per process.
	{ token: AgentStreamRegistry, mock: AgentStreamRegistry, integration: AgentStreamRegistry, real: AgentStreamRegistry },
	// The kill switch of a running issue turn (fase 2, item 2 — "pare" vale na hora): one in-memory
	// AbortController per issue in flight, shared by the dispatcher, RunIssueTurn and the pause handler.
	{ token: IssueTurnAborter, mock: IssueTurnAborter, integration: IssueTurnAborter, real: IssueTurnAborter },
	// The wait of the regret window (fase 2, item 3): wall clock wherever a session can call the hook,
	// instant in `mock`. A test that needs a steer to land mid-window overrides it.
	{
		token: RegretWindowClock,
		mock: ImmediateRegretWindowClock,
		integration: TimerRegretWindowClock,
		real: TimerRegretWindowClock,
	},
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
	// The per-workspace counter behind an issue's short key (`<PREFIX>-<n>`), drawn inside the fork's transaction.
	{
		token: IssueSequence,
		mock: MockIssueSequence,
		integration: LibSqlIssueSequence,
		real: LibSqlIssueSequence,
	},
	// What a task was born with (fase 4, S0c) — priority, reason, kind of work, model — plus the worktree its
	// session registered and when it closed. Written in the birth's own transaction (`ForkIssue`, `DeclareIssueOpen`).
	{
		token: IssueAttributesRepository,
		mock: MockIssueAttributesRepository,
		integration: LibSqlIssueAttributesRepository,
		real: LibSqlIssueAttributesRepository,
	},
	// "Is this issue of this conversation?" over the attributes table (fase 4, S0c) — for the batch receipt (S8).
	// One implementation everywhere: the environment split already lives in the repository it reads.
	{
		token: ForkedIssueReader,
		mock: AttributesForkedIssueReader,
		integration: AttributesForkedIssueReader,
		real: AttributesForkedIssueReader,
	},
	// What git says about a workspace's worktrees (fase 4, item 1). Scripted in `mock` AND `integration`: no test
	// spawns git through the container; only `real` asks the real one.
	{ token: GitWorktreeProbe, mock: MockGitWorktreeProbe, integration: MockGitWorktreeProbe, real: SystemGitWorktreeProbe },
	// The workspace's publish command (fase 4, item 6c): spawned only in `real`; scripted everywhere a test or the e2e
	// stand-in runs — no suite ever runs somebody's deploy.
	{
		token: PublishCommandRunner,
		mock: ScriptedPublishCommandRunner,
		integration: ScriptedPublishCommandRunner,
		real: ProcessPublishCommandRunner,
		e2e: ScriptedPublishCommandRunner,
	},
	// The derived handoff notes (fase 4, item 6a): the task's durable state, read from the store wherever there is a
	// database (git through the probe above, so `integration` stays scripted); the title alone in `mock`.
	{ token: HandoffNotes, mock: MockHandoffNotes, integration: LibSqlHandoffNotes, real: LibSqlHandoffNotes },
	// The hook's worktree sightings (fase 4, item 1): one in-memory instance per process, like the kill switch above.
	{ token: WorktreeSightings, mock: WorktreeSightings, integration: WorktreeSightings, real: WorktreeSightings },
	// What a triage run spent (fase 4, S1): `agent.turn.usage` with role TRIAGE, in its own unit of work. The same
	// in every env — the env split lives in the database driver under it.
	{
		token: TriageUsageRecorder,
		mock: FactTriageUsageRecorder,
		integration: FactTriageUsageRecorder,
		real: FactTriageUsageRecorder,
	},
	// The worktree janitor (fase 4, item 1). One class everywhere: what it may touch is decided by the git probe bound
	// above, and the scripted probe never judges a tree clean nor removes one — only `real` can delete a folder.
	{ token: IssueWorktreeJanitor, mock: IssueWorktreeJanitor, integration: IssueWorktreeJanitor, real: IssueWorktreeJanitor },
	// The machine under the task slots (fase 4, item 1): the data volume's free disk in `real`; a roomy fixed machine in
	// the test environments (scriptable), so no suite depends on the disk it runs on.
	{ token: MachineCapacity, mock: FixedMachineCapacity, integration: FixedMachineCapacity, real: SystemMachineCapacity },
	// The quota's live status (fase 4, S3): one in-memory board per process — the dispatcher's gate writes it, `issue`
	// (WAITING_BUDGET) and `ui` (health) read it through the read port, which resolves to the same instance.
	{ token: InMemoryQuotaStatus, mock: InMemoryQuotaStatus, integration: InMemoryQuotaStatus, real: InMemoryQuotaStatus },
	{
		token: QuotaStatusReader,
		mock: { useFactory: (c: DependencyContainer) => c.resolve(InMemoryQuotaStatus) },
		integration: { useFactory: (c: DependencyContainer) => c.resolve(InMemoryQuotaStatus) },
		real: { useFactory: (c: DependencyContainer) => c.resolve(InMemoryQuotaStatus) },
	},
	// The task lane's gate (fase 4, S3): max × machine × budget, asked by the dispatcher before every claim.
	{ token: ThroughputGate, mock: ThroughputGate, integration: ThroughputGate, real: ThroughputGate },
	// The quota budget's facts (fase 4, S2) — read from `shared_events` wherever there is a database; scripted in `mock`.
	{
		token: QuotaLedgerReader,
		mock: MockQuotaLedgerReader,
		integration: LibSqlQuotaLedgerReader,
		real: LibSqlQuotaLedgerReader,
	},
	// The declared wait (fase 5, item 1): a feedback asked in the last turn, read from the agent's own facts wherever there
	// is a database — the reconciler and the issue's life state ask the same port, so they never disagree.
	{ token: DeclaredWaitReader, mock: MockDeclaredWaitReader, integration: LibSqlDeclaredWaitReader, real: LibSqlDeclaredWaitReader },
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
	{ token: TriagePromptBuilder, mock: { useClass: TriagePromptBuilder }, real: { useClass: TriagePromptBuilder } },
	{ token: TriageAgent, mock: { useClass: TriageAgent }, real: { useClass: TriageAgent } },
	// THE PARALLEL TRIAGE'S POLICY (fase 2) — whether this env triages at all is this binding, not a flag.
	// On in `real`; off in the test envs and in `e2e` (whose stand-in runner would spend a scripted act on a
	// triage run), so every existing suite keeps the orchestrator path it was written against. A suite that
	// exercises the triage overrides it with `ModelInboundTriage` over a stub runner factory.
	{ token: InboundTriage, mock: NoInboundTriage, integration: NoInboundTriage, real: ModelInboundTriage, e2e: NoInboundTriage },
	//
	// The run credential is NOT bound here. `AgentIdentityService` is a CORE token and lives on the
	// ROOT shelf in `shared/registry.ts` — see the comment there for the mechanical reason
	// (`Controller.executeMiddlewares` resolves from the root container).
])
