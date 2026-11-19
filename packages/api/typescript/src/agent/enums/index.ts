export * from './AgentRunOutcome'
// Agent-abstraction contract lock (GOAL-agent-abstraction, Fase 1) — additive; no call site is
// migrated in this phase, the vocabulary is frozen ahead of the implementation that consumes it.
export * from './AgentName'
export * from './AgentToolName'
export * from './AgentMessageRole'
export * from './AgentToolCallStatus'
export * from './FactSource'
export * from './TransportStopKind'
// Durable session + native resume (GOAL-agent-abstraction §4.10, Fase 4).
export * from './ResumeInvalidationReason'
// The `<msg>` prompt grammar — how a line reached the conversation when the room did not see it.
export * from './MessageVia'
// Why a running issue turn was killed — pause (fase 2, item 2) or "agora" (item 4).
export * from './TurnAbortReason'
// The parallel triage's verdict on one inbound message (fase 2, triagem paralela).
export * from './TriageDecision'
// Fase 4 ("vazão") — what the provider said about a usage window, and where a fresh session's notes came from.
export * from './ProviderLimitStatus'
export * from './HandoffNotesSource'
