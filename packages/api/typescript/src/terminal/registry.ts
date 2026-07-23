// Per-env DI bindings for the terminal (agent-runtime) context.
import './errors' // Side-effect: registers this context's error codes with the framework runtime registry.

import { type InstanceRegistry, expandBindings } from '@codedm/core-typescript'
import { TerminalLLMRunner, StubTerminalLLMRunner, E2eStubTerminalLLMRunner, ClaudeCliTerminalLLMRunner } from './services/TerminalLLMRunner'
import { ProviderDetector, MockProviderDetector, SystemProviderDetector } from './services/ProviderDetector'
import { AgentStreamRegistry } from './services/AgentStreamRegistry'
import { TerminalLLMSessionRepository, DrizzleTerminalLLMSessionRepository, MockTerminalLLMSessionRepository } from './repositories'
import { SessionPrewarmService } from './services/SessionPrewarm'

// E2E HERMETIC SEAM (see shared/registry.ts + src/boot.ts). The Playwright harness boots the REAL
// daemon but must never spawn a provider CLI or probe host PATH: under CODEDM_E2E the `real`
// TerminalLLMRunner drops to a deterministic stub (NEW_ISSUE decision + canned reply frames, no
// subprocess) and the `real` ProviderDetector drops to the canned catalog (claude-code DETECTED),
// so AttachThread's provider check and the inbound → classify → session → reply chain run without
// a host toolchain. Production (flag unset) keeps ClaudeCliTerminalLLMRunner (the whatscode engine
// on Bun.Terminal, Fork D2) + SystemProviderDetector.
const E2E = process.env.CODEDM_E2E === 'true'
const realRunner = E2E ? E2eStubTerminalLLMRunner : ClaudeCliTerminalLLMRunner
const realProviderDetector = E2E ? MockProviderDetector : SystemProviderDetector

export const INSTANCE_REGISTRY: InstanceRegistry = expandBindings([
	// The runtime abstraction (WIDE seam, Fork A1): the full session engine in `real`, a
	// canned-frame stub in `mock`/`integration` so no test ever spawns a provider CLI.
	{ token: TerminalLLMRunner, mock: StubTerminalLLMRunner, integration: StubTerminalLLMRunner, real: realRunner },
	// CLI detection: canned catalog in tests, PATH/install-dir probing in `real`.
	{ token: ProviderDetector, mock: MockProviderDetector, integration: MockProviderDetector, real: realProviderDetector },
	// The adopted whatscode AgentStreamRegistry (Fork C): SSE observer channel + the absorbed
	// single-active-run guard — one shared in-memory instance per process.
	{ token: AgentStreamRegistry, mock: AgentStreamRegistry, integration: AgentStreamRegistry, real: AgentStreamRegistry },
	// Durable per-issue session record (Fork B): resume identity + prewarm recency.
	{
		token: TerminalLLMSessionRepository,
		mock: MockTerminalLLMSessionRepository,
		integration: DrizzleTerminalLLMSessionRepository,
		real: DrizzleTerminalLLMSessionRepository,
	},
	// Startup prewarm sweep (whatscode MappingPrewarmService, folded onto issueId recency).
	// `mock: null` = declared absence — the sweep is a startup-only orchestrator; mock-env tests
	// construct it manually when needed.
	{ token: SessionPrewarmService, mock: null, integration: SessionPrewarmService, real: SessionPrewarmService },
])
