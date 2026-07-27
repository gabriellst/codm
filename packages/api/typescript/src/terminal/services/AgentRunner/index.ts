// The `AgentRunner` seam and its implementations (GOAL-agent-abstraction §4.1, Fases 2/3/4.5).
//
// ONE CLASS PER CLI. `ClaudeAgentRunner` owns everything claude-shaped — argv, binary spec, frames,
// session flags, MCP config — and there is no per-CLI data literal to share with a second CLI, because a
// second CLI's difference would be a different PARSE, not a different literal (Fase 4.5). A CLI that
// lands later gets its own class beside this one, with its own measured particularities; DI is where
// `ProviderKind` → runner is resolved, which is why no runner in this subtree ever names a
// `ProviderKind` (AC-4.5.3).
//
// The process lives in `ClaudeAgentRunner/`, not in `StreamJsonCodec/` — that separation is what AC-2.5
// checks, and it is what lets every fold rule of §4.3 be tested over canned frames instead of a live CLI.
//
// `ClaudeAgentRunner` is the ONLY implementation that can start a child process, and it is bound in
// `real` only — which is how §8 rule 8 ("no test spawns a provider CLI") stays a property of the DI env
// rather than of test discipline.
export { AgentRunner } from './AgentRunner'
export { ClaudeAgentRunner, type ClaudeAgentRunnerOptions, type ClaudeBuildArgsOptions } from './ClaudeAgentRunner/ClaudeAgentRunner'
export {
	nodeAgentProcessSpawner,
	type AgentProcess,
	type AgentProcessSpawner,
	type AgentProcessSpec,
} from './ClaudeAgentRunner/AgentProcess'
export { StubAgentRunner } from './StubAgentRunner'
export { E2eStubAgentRunner } from './E2eStubAgentRunner'
