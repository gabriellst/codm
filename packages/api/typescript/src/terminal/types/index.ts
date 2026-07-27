// Agent-abstraction contract lock (GOAL-agent-abstraction, Fase 1).
export * from './AgentInput'
export * from './AgentMcpInvocation'

// Fase 2 — the transport vocabulary the codec and the `AgentRunner` seam speak. Shape frozen by §4.3
// AS AMENDED on 27-jul (the MEASURED taxonomy, not the product-study one it replaced).
export * from './AgentFrame'
export * from './AgentRunRequest'
export * from './AgentRuntimeEvent'

// Fase 4.5 — what SURVIVED the dead per-CLI data literal: the runtime-probed capability set and the detection-only
// descriptor. Everything else that type carried (argv, stream format, prompt format, MCP flags) is
// now behaviour on one runner class per CLI, where a per-CLI difference can be code instead of data
// pretending not to be a branch.
export * from './ProviderCapabilities'
export * from './ProviderBinarySpec'
