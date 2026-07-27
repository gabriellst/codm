// The `AgentRunner` seam and its three implementations (GOAL-agent-abstraction §4.1, Fase 2/3).
//
// The process lives HERE, not in `StreamJsonCodec/` — that separation is what AC-2.5 checks, and it is
// what lets every fold rule of §4.3 be tested over canned frames instead of over a live CLI.
//
// `StreamJsonAgentRunner` is the ONLY implementation that can start a child process, and it is bound
// in `real` only — which is how §8 rule 8 ("no test spawns a provider CLI") stays a property of the
// DI env rather than of test discipline.
export { AgentRunner } from './AgentRunner'
export { StreamJsonAgentRunner, type StreamJsonAgentRunnerOptions } from './StreamJsonAgentRunner/StreamJsonAgentRunner'
export {
	nodeAgentProcessSpawner,
	type AgentProcess,
	type AgentProcessSpawner,
	type AgentProcessSpec,
} from './StreamJsonAgentRunner/AgentProcess'
export { StubAgentRunner } from './StubAgentRunner'
export { E2eStubAgentRunner } from './E2eStubAgentRunner'
