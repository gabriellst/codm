// Per-env DI bindings for the terminal (agent-runtime) context.
import './errors' // Side-effect: registers this context's error codes with the framework runtime registry.

import { type InstanceRegistry, expandBindings } from '@codedm/core-typescript'
import { AgentRunner, StubAgentRunner, E2eStubAgentRunner, CliAgentRunner } from './services/AgentRunner'
import { ProviderDetector, MockProviderDetector, SystemProviderDetector } from './services/ProviderDetector'
import { TerminalSessionRegistry } from './services/TerminalSessionRegistry'

// E2E HERMETIC SEAM (see shared/registry.ts + src/boot/assert-e2e-safe.ts). The Playwright harness
// boots the REAL daemon but must never spawn a provider CLI or probe host PATH: under CODEDM_E2E the
// `real` AgentRunner drops to a deterministic stub (NEW_ISSUE decision + canned reply frames, no
// subprocess) and the `real` ProviderDetector drops to the canned catalog (claude-code DETECTED), so
// AttachThread's provider check and the inbound → classify → session → reply chain run without a host
// toolchain. Production (flag unset) keeps CliAgentRunner + SystemProviderDetector.
const E2E = process.env.CODEDM_E2E === 'true'
const realAgentRunner = E2E ? E2eStubAgentRunner : CliAgentRunner
const realProviderDetector = E2E ? MockProviderDetector : SystemProviderDetector

export const INSTANCE_REGISTRY: InstanceRegistry = expandBindings([
	// The runtime abstraction: a real subprocess/PTY driver in `real`, a canned-frame stub in
	// `mock`/`integration` so no test ever spawns a provider CLI or calls a real LLM.
	{ token: AgentRunner, mock: StubAgentRunner, integration: StubAgentRunner, real: realAgentRunner },
	// CLI detection: canned catalog in tests, PATH/install-dir probing in `real`.
	{ token: ProviderDetector, mock: MockProviderDetector, integration: MockProviderDetector, real: realProviderDetector },
	// The observer registry + single-active-run guard — one shared in-memory instance per process.
	{ token: TerminalSessionRegistry, mock: TerminalSessionRegistry, real: TerminalSessionRegistry },
])
