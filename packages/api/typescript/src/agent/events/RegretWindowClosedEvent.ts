import { BaseDomainEvent, z } from '@codm/core-typescript'
import { RegretWindowSchema } from '@shared/schemas'

/**
 * An issue's session waited before an irreversible action, and the wait ended (fase 2, item 3 — janela
 * de arrependimento): it went ahead, or a message / a pause cancelled it.
 *
 * Recorded so the issue's TIMELINE can say "esperou 20 s antes de git push — seguiu / cancelado por
 * recado". It carries the KIND of action, never the command text: a command line can hold a token
 * (`git push https://<token>@…`, `npm publish --otp=…`), and the timeline is published to the cloud panel
 * verbatim. No handler reacts to it — it is a moment to show, not a trigger.
 */
export const RegretWindowClosedEventSchema = z.domainEvent({
	issueId: z.string(),
	threadId: z.string(),
	// The window itself — the shape the issue timeline reads back (`RegretWindowSchema`, shared).
	...RegretWindowSchema.shape,
})

export class RegretWindowClosedEvent extends BaseDomainEvent<typeof RegretWindowClosedEventSchema> {
	static override readonly name = 'agent.regret_window_closed' as const
	static readonly schema = RegretWindowClosedEventSchema
}
