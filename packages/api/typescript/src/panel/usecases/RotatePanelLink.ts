import { injectable } from 'tsyringe-neo'
import { Handler, z, BaseError } from '@codm/core-typescript'
import type { Transaction } from '@codm/core-typescript'
import { PanelStore } from '../services/PanelStore'
import { PanelIdentityStore } from '../services/PanelIdentityStore'
import type { ApplicationErrors } from '../errors'
import { newPanelToken } from './SyncPanel'

export const RotatePanelLinkInputSchema = z.object({ ownerId: z.uuid(), threadId: z.uuid() })
export const RotatePanelLinkOutputSchema = z.object({ token: z.string() })

/**
 * Replace a group's link token — the old link stops working at once (someone left the group, or it leaked).
 * Every device identified on the old link and every pending code die with it, in the same transaction
 * (fase 2, item 6a): a leaked link must not leave a verified browser behind.
 */
@injectable()
export class RotatePanelLink extends Handler<typeof RotatePanelLinkInputSchema, typeof RotatePanelLinkOutputSchema> {
	readonly name = 'rotate_panel_link' as const
	readonly inputSchema = RotatePanelLinkInputSchema
	readonly outputSchema = RotatePanelLinkOutputSchema

	constructor(
		private readonly store: PanelStore,
		private readonly identities: PanelIdentityStore,
	) {
		super()
	}

	protected async handle(input: this['input'], tx?: Transaction): Promise<this['output']> {
		const token = newPanelToken()
		const rotated = await this.withTransaction(tx, async tx => {
			if (!(await this.store.rotateToken(input.ownerId, input.threadId, token, tx))) return false
			await this.identities.revokeGroup(input.threadId, tx)
			return true
		})
		if (!rotated) throw new BaseError<ApplicationErrors>('PANEL_NOT_FOUND', `no panel group ${input.threadId} for this owner`)
		return { token }
	}
}
