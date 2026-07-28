// Per-env DI bindings for the `agent` context (the agent runtime).
import './errors' // Side-effect: registers this context's error codes with the framework runtime registry.

import { type InstanceRegistry, expandBindings } from '@codedm/core-typescript'
import { ProviderKind } from '@codedm/contracts-typescript/wire/enums'
import { AgentRunner, ClaudeAgentRunner, StubAgentRunner, E2eStubAgentRunner } from './services/AgentRunner'
import { ProviderDetector, MockProviderDetector, SystemProviderDetector } from './services/ProviderDetector'
import { AgentStreamRegistry } from './services/AgentStreamRegistry'
import { AgentSessionRepository, DrizzleAgentSessionRepository, MockAgentSessionRepository } from './repositories'
import { IssueRouter, DefaultIssueRouter } from './services/IssueRouter'
import { ClassifyIssueAgent, ClassifyIssuePromptBuilder, IssueWorkAgent, IssueWorkPromptBuilder } from './agents'
import { RunTokenService } from './services/RunTokenService'
import { InMemoryRunTokenService } from './mcp/RunTokenService'
// Side-effect: publishes the MCP manifest to the core registry the OpenAPI emitter reads. It has to
// happen before `generateSpecification()`, which the composition root guarantees by importing every
// context router first — the same ordering `x-error-codes` already relies on.
import './mcp/register'

// E2E HERMETIC SEAM (see shared/registry.ts + src/boot.ts). The Playwright harness boots the REAL
// daemon but must never spawn a provider CLI or probe host PATH: under CODEDM_E2E the `real`
// AgentRunner drops to a deterministic stub (NEW_ISSUE decision + canned reply frames, no
// subprocess) and the `real` ProviderDetector drops to the canned catalog (claude-code DETECTED),
// so AttachThread's provider check and the inbound → classify → session → reply chain run without
// a host toolchain. Production (flag unset) keeps ClaudeAgentRunner (bidirectional stream-json
// over plain pipes) + SystemProviderDetector.
const E2E = process.env.CODEDM_E2E === 'true'
const realRunner = E2E ? E2eStubAgentRunner : ClaudeAgentRunner
const realProviderDetector = E2E ? MockProviderDetector : SystemProviderDetector

/**
 * Which `ProviderKind`s the `AgentRunner` binding just below can ACTUALLY drive — read by
 * `RunIssueTurn.resolveProvider` before ever calling `run()` (closes a Fase 4.5 misrouting hazard).
 *
 * `DetectProviders` reports codex/opencode identically to claude-code (installation status only —
 * `ProviderDetector`'s `PROVIDER_BINARIES` declares real `bin` names for all three so they show up
 * correctly in the catalog), and `AttachThread` only checks that the CLI is INSTALLED, never that a
 * runner exists for it. So a machine where the codex binary happens to be on PATH lets a thread
 * declare `providers: ['CODEX']` even though codex is DETECT-ONLY today (no runner class). Without
 * this list, that thread's turns would fall through to `this.runner.run()` and be silently driven by
 * whichever runner IS bound here — `ClaudeAgentRunner`'s argv, stream format and session semantics,
 * applied to the wrong CLI.
 *
 * Deliberately a FLAT constant, not a `ProviderKind`-keyed lookup: every env below binds a
 * claude-only runner (`ClaudeAgentRunner` in `real`, `StubAgentRunner`/`E2eStubAgentRunner`
 * standing in for it elsewhere), so the supported set is identical across `mock`/`integration`/`real`
 * today. It grows into a real per-`ProviderKind → runner` lookup the day a second CLI lands
 * (Fase 6+) — see the `AgentRunner` binding comment below for why that lookup lives HERE and not on
 * the runner classes themselves (AC-4.5.3 forbids a runner from branching, or even naming, a
 * `ProviderKind`).
 */
export const RUNNER_SUPPORTED_PROVIDERS: readonly ProviderKind[] = [ProviderKind.CLAUDE_CODE]

export const INSTANCE_REGISTRY: InstanceRegistry = expandBindings([
	// THE ONE-METHOD SEAM (§4.1) — `run()` plus `shutdown()`, and nothing else. `ClaudeAgentRunner`
	// is the only implementation that can start an external CLI, and it is bound in `real` ONLY: §8
	// rule 8 makes "no test spawns a provider CLI" a property of the DI ENV rather than of test
	// discipline. Both consumers (`IssueClassifier`, `RunIssueTurn`) resolve this one token — the split
	// between "classify" and "work" is an `outputSchema` on the request, never a second binding.
	//
	// THIS BINDING IS WHERE `ProviderKind` → RUNNER IS RESOLVED (Fase 4.5). One class per CLI means the
	// choice of CLI is a WIRING decision, made here, once, before any request exists — which is why no
	// runner takes a provider, no request carries one, and AC-4.5.3 can demand zero provider-identity
	// branches inside `services/AgentRunner`. Today exactly one CLI has a runner (`claude`), so the
	// resolution is a direct binding; a second CLI landing turns this line into a keyed lookup HERE,
	// and still not a branch inside a runner.
	{ token: AgentRunner, mock: StubAgentRunner, integration: StubAgentRunner, real: realRunner },
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
	// ── The internal agents (§4.8) ────────────────────────────────────────────────────────────────
	//
	// CLASS TOKENS, same implementation in all three envs — an agent has no mock/real split because it
	// holds no I/O of its own: everything that touches the world is the `AgentRunner` above, which DOES
	// have one. That is what keeps "no test spawns a CLI" a property of the DI env (§8 rule 8) while the
	// agents under test stay the real ones.
	//
	// There is deliberately NO name→agent map and NO factory. `AgentName` is identity — the label on a
	// log line, a span and a run-token claim — never a resolution key; resolution is
	// `container.resolve(IssueWorkAgent)`, which a rename breaks at compile time instead of at runtime.
	// AC-5.3 greps for exactly that absence.
	// TRANSIENT (`useClass`), not singleton, and the reason is the seam above: an agent holds nothing
	// but a reference to the `AgentRunner` and its prompt builder, so a singleton buys no shared state
	// — while it WOULD capture whichever runner was bound at first construction. That is precisely the
	// binding §8 rule 8 swaps per env (and `TestBed.override` swaps per suite), so a cached agent would
	// quietly keep driving the previous one. One allocation per resolve, and the graph stays honest.
	{ token: ClassifyIssuePromptBuilder, mock: { useClass: ClassifyIssuePromptBuilder }, real: { useClass: ClassifyIssuePromptBuilder } },
	{ token: IssueWorkPromptBuilder, mock: { useClass: IssueWorkPromptBuilder }, real: { useClass: IssueWorkPromptBuilder } },
	{ token: ClassifyIssueAgent, mock: { useClass: ClassifyIssueAgent }, real: { useClass: ClassifyIssueAgent } },
	{ token: IssueWorkAgent, mock: { useClass: IssueWorkAgent }, real: { useClass: IssueWorkAgent } },
	// The routing POLICY over the classification agent — what `thread/usecases/ClassifyMessage` injects.
	//
	// `DefaultIssueRouter` in ALL THREE envs, and the `mock` column is the interesting one. The usual
	// service shape binds the Mock there, but this service's only I/O is the `ClassifyIssueAgent` it
	// drives, whose only I/O is the `AgentRunner` bound above — already a stub outside `real`. Binding
	// the canned router by default would therefore replace REAL policy (reply-quote shortcut,
	// confidence floor, slug minting) with a fixed answer in exactly the suites that exist to exercise
	// the inbound→classify→run choreography end to end. Measured, not assumed: doing so turned two flow
	// tests red, because a runner staged to answer NEW_ISSUE no longer reached any policy.
	//
	// `MockIssueRouter` is exported and is the right double for a consumer test that wants to FIX the
	// decision and assert what `ClassifyMessage` persists around it — reached via
	// `testBed.override(IssueRouter, new MockIssueRouter())`, per-suite, rather than as the env default.
	{ token: IssueRouter, mock: { useClass: DefaultIssueRouter }, real: { useClass: DefaultIssueRouter } },
	// The run token — the SINGLE source of identity for every MCP tool call (§4.4). One in-memory
	// instance per process in every env: a token's lifetime is one run inside one daemon, and a
	// persisted one would outlive the process it authorizes. Bound in all three envs because the
	// integration and mock suites exercise the router's 401/403 boundary directly, and a double would
	// be a second implementation of the thing under test.
	{ token: RunTokenService, mock: InMemoryRunTokenService, integration: InMemoryRunTokenService, real: InMemoryRunTokenService },
])
