// The `AgentRunner` seam and its stream-json implementation (GOAL-agent-abstraction §4.1, Fase 2).
//
// The process lives HERE, not in `StreamJsonCodec/` — that separation is what AC-2.5 checks, and it is
// what lets every fold rule of §4.3 be tested over canned frames instead of over a live CLI.
export { AgentRunner } from './AgentRunner'
export { StreamJsonAgentRunner, type StreamJsonAgentRunnerOptions } from './StreamJsonAgentRunner/StreamJsonAgentRunner'
export { nodeAgentProcessSpawner, type AgentProcess, type AgentProcessSpawner, type AgentProcessSpec } from './StreamJsonAgentRunner/AgentProcess'
