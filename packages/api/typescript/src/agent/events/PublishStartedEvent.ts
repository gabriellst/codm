import { BaseDomainEvent, z } from '@codm/core-typescript'

/**
 * The workspace's declared PUBLISH COMMAND is ABOUT TO BE SPAWNED for one authorization (fase 4, item 6c) — written
 * and committed BEFORE the spawn. It is what CONSUMES the authorization: a publish is irreversible, so it runs AT MOST
 * ONCE per answer.
 *
 * Its `entityId` is the AUTHORIZATION — the `stopId` of the resolution that authorized the run — never the issue: the
 * lookup "was this answer's command already started?" is then exact, whatever other authorizations the task has had
 * since (a later one never hides an earlier one).
 *
 * A start with no `agent.publish.ran` for the same stop means the daemon stopped between the spawn and the record:
 * the next attempt records `PublishRunOutcome.UNKNOWN`, tells the group and the session to check — and never runs the
 * command again. Not a timeline item (the `PUBLISH_RAN` that follows is); carries no argv.
 */
export const PublishStartedEventSchema = z.domainEvent({
	issueId: z.string(),
	threadId: z.string(),
	stopId: z.string(),
})

export class PublishStartedEvent extends BaseDomainEvent<typeof PublishStartedEventSchema> {
	static override readonly name = 'agent.publish.started' as const
	static readonly schema = PublishStartedEventSchema
}
