import { BaseDomainEvent, z } from '@codm/core-typescript'
import { PublishRunSchema } from '@shared/schemas'

/**
 * The workspace's declared PUBLISH COMMAND ran for a task — or its regret window cancelled it (fase 4, item 6c).
 *
 * Read back by the issue's timeline as `PUBLISH_RAN` (this fact's id IS the item's id, and the run's captured output
 * is linked to it by `issue_terminal_lines.timeline_item_id`). It carries the outcome, the exit code and the duration —
 * NEVER the command line nor its output: an argv can hold a credential, and the timeline goes to the cloud panel.
 *
 * `stopId` names the resolution that authorized the run: one run per authorization, even when the item that carried
 * it is claimed again.
 */
export const PublishRanEventSchema = z.domainEvent({
	issueId: z.string(),
	threadId: z.string(),
	stopId: z.string(),
	...PublishRunSchema.shape,
})

export class PublishRanEvent extends BaseDomainEvent<typeof PublishRanEventSchema> {
	static override readonly name = 'agent.publish.ran' as const
	static readonly schema = PublishRanEventSchema
}
