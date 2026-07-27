// Per-env DI bindings for the terminal (agent-runtime) context.
import './errors' // Side-effect: registers this context's error codes with the framework runtime registry.

import { type InstanceRegistry, expandBindings } from '@codedm/core-typescript'
import { AgentRunner, ClaudeAgentRunner, StubAgentRunner, E2eStubAgentRunner } from './services/AgentRunner'
import { ProviderDetector, MockProviderDetector, SystemProviderDetector } from './services/ProviderDetector'
import { AgentStreamRegistry } from './services/AgentStreamRegistry'
import { AgentSessionRepository, DrizzleAgentSessionRepository, MockAgentSessionRepository } from './repositories'

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
])
