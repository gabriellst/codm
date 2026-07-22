// Per-env DI bindings for the terminal (agent-runtime) context.
import './errors' // Side-effect: registers this context's error codes with the framework runtime registry.

import { type InstanceRegistry, expandBindings } from '@template/core-typescript'
import { AgentRunner, StubAgentRunner, CliAgentRunner } from './services/AgentRunner'
import { ProviderDetector, MockProviderDetector, SystemProviderDetector } from './services/ProviderDetector'
import { TerminalSessionRegistry } from './services/TerminalSessionRegistry'

export const INSTANCE_REGISTRY: InstanceRegistry = expandBindings([
	// The runtime abstraction: a real subprocess/PTY driver in `real`, a canned-frame stub in
	// `mock`/`integration` so no test ever spawns a provider CLI or calls a real LLM.
	{ token: AgentRunner, mock: StubAgentRunner, integration: StubAgentRunner, real: CliAgentRunner },
	// CLI detection: canned catalog in tests, PATH/install-dir probing in `real`.
	{ token: ProviderDetector, mock: MockProviderDetector, integration: MockProviderDetector, real: SystemProviderDetector },
	// The observer registry + single-active-run guard — one shared in-memory instance per process.
	{ token: TerminalSessionRegistry, mock: TerminalSessionRegistry, real: TerminalSessionRegistry },
])
