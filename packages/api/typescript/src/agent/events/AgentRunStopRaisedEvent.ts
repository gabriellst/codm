import { BaseDomainEvent, z } from '@codm/core-typescript'
import { StopKind } from '@codm/contracts-typescript/wire/enums'
import { StopAskSchema } from '@shared/objects'
import { FactSource } from '../enums/FactSource'

/**
 * Context-private fact: a terminal session stopped and needs the human (a non-zero exit maps to
 * SERVER_ERROR). The internal bridge maps it to the frozen `integration.thread.stop_raised`, which
 * flips the thread to NEEDS_ATTENTION and lights the dock badge / Home callout.
 *
 * Two fields were added in Fase 6, both load-bearing:
 *  - `detail` — the human-readable reason. `DeclareStop` carries the agent's own text and
 *    `AskOperator` carries the question; without it both die at the bridge and the Needs-you card is
 *    born empty (§4.4 item (i)). The matching ADDITIVE field on the frozen
 *    `integration.thread.stop_raised` is what lets the text survive the crossing.
 *  - `source` — §4.3 rule 6. `DECLARED` for a stop the agent raised through a tool, `INFERRED` for a
 *    TRANSPORT stop the runner observed (`AUTH_REQUIRED` / `SERVER_ERROR`), which never depended on a
 *    tool at all and is therefore always inferred.
 *
 * Fase 3 adds `ask` — the decision or question the issue put (`AskDecision` / `AskQuestion` and the
 * legacy doors that alias to them). It is the WIRE shape of an ask the tool already validated through the
 * `StopAsk` value object before saving this fact, and `kind` is the one that value object decided (an
 * effect escalates a question to a decision): a malformed ask is refused to the model on the tool call,
 * never discovered by the consumer and dead-lettered while the issue sits in NEEDS_INPUT with no stop.
 */
export const AgentRunStopRaisedEventSchema = z.domainEvent({
	stopId: z.string(),
	issueId: z.string(),
	threadId: z.string(),
	kind: z.enum(StopKind),
	detail: z.string(),
	source: z.enum(FactSource),
	ask: StopAskSchema.optional(),
})

export class AgentRunStopRaisedEvent extends BaseDomainEvent<typeof AgentRunStopRaisedEventSchema> {
	static override readonly name = 'agent.run.stop_raised' as const
	static readonly schema = AgentRunStopRaisedEventSchema
}
