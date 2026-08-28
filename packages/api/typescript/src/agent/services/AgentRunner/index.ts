// The `AgentRunner` seam and its implementations (GOAL-agent-abstraction §4.1, Fases 2/3/4.5).
//
// ONE CLASS PER CLI. Each runner owns its CLI-shaped argv, binary spec, frames, session flags and MCP
// config; those differences are behavior, not entries in a shared data literal (Fase 4.5). A CLI that
// lands gets its own class beside the others, with its own measured particularities; DI is where
// `ProviderKind` → runner is resolved, which is why no runner in this subtree ever names a
// `ProviderKind` (AC-4.5.3).
//
// The process lives in `ClaudeAgentRunner/`, not in `StreamJsonCodec/` — that separation is what AC-2.5
// checks, and it is what lets every fold rule of §4.3 be tested over canned frames instead of a live CLI.
//
// Real runner implementations are bound in `real` only — which is how §8 rule 8 ("no test spawns a
// provider CLI") stays a property of the DI env rather than of test discipline.
export { AgentRunner } from './AgentRunner'
export { ClaudeAgentRunner, type ClaudeAgentRunnerOptions, type ClaudeBuildArgsOptions } from './ClaudeAgentRunner/ClaudeAgentRunner'
export { CodexAgentRunner, type CodexAgentRunnerOptions, type CodexBuildArgsOptions } from './CodexAgentRunner/CodexAgentRunner'
export {
	nodeAgentProcessSpawner,
	type AgentProcess,
	type AgentProcessSpawner,
	type AgentProcessSpec,
} from './ClaudeAgentRunner/AgentProcess'
export { StubAgentRunner } from './StubAgentRunner'
export { E2eStubAgentRunner } from './E2eStubAgentRunner'
