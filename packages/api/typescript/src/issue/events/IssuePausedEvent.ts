import { BaseDomainEvent, z } from '@codm/core-typescript'
import { IssueControlSource } from '@codm/contracts-typescript/wire/enums'

/**
 * Someone HELD an issue's work (fase 2, item 2 — "pausa como comando").
 *
 * Carries WHO asked and FROM WHERE because the timeline shows it ("pausada por <nome> pelo WhatsApp")
 * and because a hold nobody can attribute is a hold nobody dares to lift. `requestedBy` is the display
 * name as the transcript resolves it; `requestedById` the roster id (a WhatsApp sender) or the console
 * operator's user id — optional, a console session without a user id still pauses.
 *
 * Consumed in-context by `AbortIssueTurnOnPause`, which kills the running turn, if any.
 */
export const IssuePausedEventSchema = z.domainEvent({
	issueId: z.string(),
	threadId: z.string(),
	source: z.enum(IssueControlSource),
	requestedBy: z.string().optional(),
	requestedById: z.string().optional(),
})
export class IssuePausedEvent extends BaseDomainEvent<typeof IssuePausedEventSchema> {
	static override readonly name = 'issue.paused' as const
	static readonly schema = IssuePausedEventSchema
}
