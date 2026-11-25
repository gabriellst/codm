import { BaseDomainEvent, z } from '@codm/core-typescript'

/**
 * Context-private fact (fase 3, item 4): a `boletim` was answered with the group's bulletin, by rule, with
 * no model turn. No text — it exists to COUNT the reports asked before and after the phase (spec, "Como
 * medi": `thread.bulletin_sent` × THREAD items).
 */
export const BulletinSentEventSchema = z.domainEvent({
	threadId: z.uuid(),
	/** The inbound entry that asked, and the entry of the bulletin the group got. */
	entryId: z.uuid(),
	bulletinEntryId: z.uuid(),
})

export class BulletinSentEvent extends BaseDomainEvent<typeof BulletinSentEventSchema> {
	static override readonly name = 'thread.bulletin_sent' as const
	static readonly schema = BulletinSentEventSchema
}
