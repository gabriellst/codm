import { injectable } from 'tsyringe-neo'
import { Handler, z } from '@codm/core-typescript'
import { PanelPublisher } from '../services/PanelPublisher'

export const GetThreadPanelLinkInputSchema = z.object({ threadId: z.uuid() })
export const GetThreadPanelLinkOutputSchema = z.object({
	/** The group's panel link; absent until the first push returned its token (or when not logged in). */
	url: z.string().optional(),
})

/** Read — the panel link of one conversation, for the console to copy (fase 1). */
@injectable()
export class GetThreadPanelLink extends Handler<typeof GetThreadPanelLinkInputSchema, typeof GetThreadPanelLinkOutputSchema> {
	readonly name = 'get_thread_panel_link' as const
	readonly inputSchema = GetThreadPanelLinkInputSchema
	readonly outputSchema = GetThreadPanelLinkOutputSchema

	constructor(private readonly publisher: PanelPublisher) {
		super()
	}

	protected async handle(input: this['input']): Promise<this['output']> {
		return { url: this.publisher.linkOf(input.threadId) }
	}
}
