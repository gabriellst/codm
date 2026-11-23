import { BaseDomainEvent, z } from '@codm/core-typescript'
import { MailboxTargetKind } from '@codm/contracts-typescript/wire/enums'
import { RetryScheduledSchema } from '@shared/schemas'
import { MailboxFailureClass } from '../enums/MailboxFailureClass'

/**
 * A failed turn's item was put back to try again later (fase 5, item 2) — written in the SAME transaction as the
 * `fail` that scheduled it, so the queue and the fact never disagree.
 *
 * `entityId` is the target (the issue, for the task lane): the issue's timeline reads it as "nova tentativa às hh:mm,
 * 3 de 5" (`RETRY_SCHEDULED`, parsed with the shared `RetryScheduledSchema`). It carries the failure's CLASS, never the
 * error's text — a provider's message can echo a prompt or a path, and the timeline is published to the cloud panel.
 * No handler reacts to it: a moment to show, not a trigger.
 */
export const AgentRetryScheduledEventSchema = z.domainEvent({
	itemId: z.string(),
	targetKind: z.enum(MailboxTargetKind),
	targetId: z.string(),
	failureClass: z.enum(MailboxFailureClass),
	// The schedule itself — the shape the issue timeline reads back (`RetryScheduledSchema`, shared).
	...RetryScheduledSchema.shape,
})

export class AgentRetryScheduledEvent extends BaseDomainEvent<typeof AgentRetryScheduledEventSchema> {
	static override readonly name = 'agent.mailbox.retry_scheduled' as const
	static readonly schema = AgentRetryScheduledEventSchema
}
