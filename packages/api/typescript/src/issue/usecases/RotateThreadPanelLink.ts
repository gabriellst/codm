import { injectable } from 'tsyringe-neo'
import { Handler, z, BaseError } from '@codm/core-typescript'
import { PanelPublisher } from '../services/PanelPublisher'
import type { ApplicationErrors } from '../errors'

export const RotateThreadPanelLinkInputSchema = z.object({ threadId: z.uuid() })
export const RotateThreadPanelLinkOutputSchema = z.object({ url: z.string() })

/**
 * Replace one conversation's panel link (fase 1) — someone left the group, or the link leaked. The old
 * link stops working at once in the cloud. Refused with PANEL_LINK_UNAVAILABLE when this install is not
 * logged in to the cloud, or the group was never pushed (it has no link to replace yet).
 */
@injectable()
export class RotateThreadPanelLink extends Handler<typeof RotateThreadPanelLinkInputSchema, typeof RotateThreadPanelLinkOutputSchema> {
	readonly name = 'rotate_thread_panel_link' as const
	readonly inputSchema = RotateThreadPanelLinkInputSchema
	readonly outputSchema = RotateThreadPanelLinkOutputSchema

	constructor(private readonly publisher: PanelPublisher) {
		super()
	}

	protected async handle(input: this['input']): Promise<this['output']> {
		if (!this.publisher.linkOf(input.threadId)) {
			throw new BaseError<ApplicationErrors>('PANEL_LINK_UNAVAILABLE', 'this conversation has no panel link yet')
		}
		await this.publisher.rotate(input.threadId)
		const url = this.publisher.linkOf(input.threadId)
		if (!url) throw new BaseError<ApplicationErrors>('PANEL_LINK_UNAVAILABLE', 'not logged in to the cloud')
		return { url }
	}
}
