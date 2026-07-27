// Agent-abstraction contract lock (GOAL-agent-abstraction, Fase 1). Additive: nothing here is wired
// into a call site yet — `TerminalLLMRunner` and `buildCommand` are untouched and still in charge.
export * from './AgentInput'
export * from './AgentMcpInvocation'
