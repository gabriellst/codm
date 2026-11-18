import { injectable } from 'tsyringe-neo'
import { Handler, z, BaseError } from '@codm/core-typescript'
import { PanelIdentityStore } from '../services/PanelIdentityStore'
import { resolvePanelDevice } from './panelDevice'
import { PanelMemberSchema } from './SyncPanelRoster'
import type { ApplicationErrors } from '../errors'

export const GetPanelIdentityInputSchema = z.object({
	token: z.string().min(16).max(128),
	/** The device cookie's value, when the browser sent one. */
	deviceToken: z.string().min(1).max(256).optional(),
})
export const GetPanelIdentityOutputSchema = z.object({
	/** Who this browser is in this group — absent when nobody (never verified, expired, left the group, link rotated). */
	member: PanelMemberSchema.optional(),
})

/**
 * Query — who this device is on ONE group's panel (fase 2, item 6a). A session only counts on the group
 * it was opened for, while unexpired, and while the member is still on the group's CURRENT roster — a
 * person who left the group stops being anyone here at the next roster push. The name and the grant are
 * read from that roster, never frozen in the session.
 */
@injectable()
export class GetPanelIdentity extends Handler<typeof GetPanelIdentityInputSchema, typeof GetPanelIdentityOutputSchema> {
	readonly name = 'get_panel_identity' as const
	readonly inputSchema = GetPanelIdentityInputSchema
	readonly outputSchema = GetPanelIdentityOutputSchema

	constructor(private readonly store: PanelIdentityStore) {
		super()
	}

	protected async handle(input: this['input']): Promise<this['output']> {
		const { group, member } = await resolvePanelDevice(this.store, input.token, input.deviceToken)
		if (!group) throw new BaseError<ApplicationErrors>('PANEL_NOT_FOUND', 'no panel for this link')
		return { member }
	}
}
