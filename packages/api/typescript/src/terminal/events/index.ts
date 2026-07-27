export { TerminalSessionStartedEvent, TerminalSessionStartedEventSchema } from './TerminalSessionStartedEvent'
export { TerminalReplyDraftedEvent, TerminalReplyDraftedEventSchema } from './TerminalReplyDraftedEvent'
export { TerminalSessionCompletedEvent, TerminalSessionCompletedEventSchema } from './TerminalSessionCompletedEvent'
export { TerminalStopRaisedEvent, TerminalStopRaisedEventSchema } from './TerminalStopRaisedEvent'
// Engine lifecycle facts (phase-10 port) were `TerminalSessionResumedEvent` / `TerminalSessionKilledEvent`
// / `TerminalSessionIdleEvictedEvent` — all PTY vocabulary ("the live REPL was reused", "the
// pseudo-terminal died") that a run over pipes cannot observe. None was ever constructed outside the
// deleted engine, so all three are gone (the last two went in Fase 3 with the engine; the first two
// were deleted in this cleanup pass rather than waiting on the Fase 4 `--resume` call).

// ── Agent turn facts (GOAL-agent-abstraction §4.3, Fase 1 contract lock) ────────────────────────
// The SECOND of the three signal categories. Frozen HERE, BEFORE the codec that will produce them
// (Fase 2), because the accumulator's whole job is stated by this union: a pure fold from transport
// frames to these three facts, and nothing else. Writing the codec first would have let the wire
// format dictate the domain vocabulary — which is precisely the failure this rewrite is undoing.
export { AgentMessageEvent, AgentMessageEventSchema } from './AgentMessageEvent'
export { AgentToolCallEvent, AgentToolCallEventSchema } from './AgentToolCallEvent'
export { AgentUsageEvent, AgentUsageEventSchema } from './AgentUsageEvent'

import type { AgentMessageEvent } from './AgentMessageEvent'
import type { AgentToolCallEvent } from './AgentToolCallEvent'
import type { AgentUsageEvent } from './AgentUsageEvent'

/**
 * Everything the accumulator can consolidate out of one turn's transport frames.
 *
 * Every member is a `BaseDomainEvent` subclass — NOT a POJO — because these go to the outbox, and a
 * plain object would arrive at the mediator without a class to be rehydrated into. AC-1.7 proves the
 * union with `instanceof` per variant.
 *
 * What is deliberately NOT in this union: anything the agent DECLARES (issue completed, stop raised,
 * artifact recorded). Those are the THIRD category — they arrive as MCP tool calls, are persisted by
 * the use case that serves the call, and reuse the event classes that already exist. Adding them
 * here would be the double-publish §4.3 rule 3 exists to prevent.
 */
export type AgentTurnFact = AgentMessageEvent | AgentToolCallEvent | AgentUsageEvent
