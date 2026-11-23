import { BaseDomainEvent, z } from '@codm/core-typescript'
import { IssueSignalLevel } from '@codm/contracts-typescript/wire/enums'

/**
 * The levels an issue SAYS spontaneously (fase 3, item 1) — a preview to look at (`RequestFeedback`) and
 * what it did (`ReportProgress`; the end of a turn, slice S6). A decision and a question are STOPS
 * (`AgentRunStopRaisedEvent` with an `ask`), the closing comes from the completion fact and a block notice
 * from the thread's own stops — so this fact has no way to carry any of them.
 */
export const SPOKEN_LEVELS = [IssueSignalLevel.FEEDBACK, IssueSignalLevel.PROGRESS] as const
export type SpokenLevel = (typeof SPOKEN_LEVELS)[number]

export const IssueSpokeEventSchema = z.domainEvent({
	issueId: z.string(),
	threadId: z.string(),
	level: z.enum(SPOKEN_LEVELS),
	/** The issue's own words, verbatim. */
	text: z.string(),
	/** Every artifact the signal cites (the main one included) — by id; the thread reads the rows. */
	artifactIds: z.array(z.string()),
	/** The preview a FEEDBACK sends to the group; the others stay on the panel. */
	mainArtifactId: z.string().optional(),
	/** Who the issue is talking to — the key of the per-person digest. */
	addresseeId: z.string().optional(),
})

/**
 * An issue SAID something that is neither a stop nor its completion (fase 3, item 1) — context-private;
 * the bridge (`PublishAgentIntegrationEvents`) republishes it as the frozen
 * `integration.thread.issue_signal`, and the thread's output policy decides where it goes.
 *
 * The agent runtime only knows WHAT the issue said; WHO it reaches (group, digest, panel) is the group's
 * rule, which is why it crosses instead of being delivered here — the same reason the orchestrator's
 * reply does.
 */
export class IssueSpokeEvent extends BaseDomainEvent<typeof IssueSpokeEventSchema> {
	static override readonly name = 'agent.issue_spoke' as const
	static readonly schema = IssueSpokeEventSchema
}
