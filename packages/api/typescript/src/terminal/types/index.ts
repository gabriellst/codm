// Agent-abstraction contract lock (GOAL-agent-abstraction, Fase 1).
export * from './AgentInput'
export * from './AgentMcpInvocation'

// Fase 2 — the transport vocabulary the codec and the `AgentRunner` seam speak. Shape frozen by §4.3
// AS AMENDED on 27-jul (the MEASURED taxonomy, not the product-study one it replaced).
export * from './AgentFrame'
export * from './AgentRunRequest'
export * from './AgentRuntimeEvent'
