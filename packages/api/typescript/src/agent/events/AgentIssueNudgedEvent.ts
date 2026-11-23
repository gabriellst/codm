import { BaseDomainEvent, z } from '@codm/core-typescript'
import { NudgeMarkSchema } from '@shared/schemas'

export const AgentIssueNudgedEventSchema = z.domainEvent({
	issueId: z.string(),
	threadId: z.string(),
	/** The consumed item whose silent turn opened the episode — both nudges of one episode share it. */
	rootItemId: z.string(),
	// Which nudge and who sent it — the shape the issue timeline reads back (`NudgeMarkSchema`, shared).
	...NudgeMarkSchema.shape,
})

/**
 * An issue that went quiet was NUDGED (fase 5, item 1) — written in the SAME transaction as the `REMINDER` item it
 * describes, so the queue and the fact never disagree.
 *
 * `entityId` is the issue. Two readers: the issue timeline shows it as "empurrão 1 de 2" in place of the reminder's
 * STEER (`NUDGED`, parsed with the shared `NudgeMarkSchema`), and the supervisor counts first nudges per day
 * (`NUDGE_LOOP`). Carries no text — the nudge's words are constants of the reconciler.
 */
export class AgentIssueNudgedEvent extends BaseDomainEvent<typeof AgentIssueNudgedEventSchema> {
	static override readonly name = 'agent.issue.nudged' as const
	static readonly schema = AgentIssueNudgedEventSchema
}
