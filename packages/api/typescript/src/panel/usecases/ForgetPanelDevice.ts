import { injectable } from 'tsyringe-neo'
import { Handler, z, BaseError } from '@codm/core-typescript'
import type { Transaction } from '@codm/core-typescript'
import { PanelIdentityStore } from '../services/PanelIdentityStore'
import { panelDeviceTokenHash } from '../utils/panelIdentity'
import type { ApplicationErrors } from '../errors'

export const ForgetPanelDeviceInputSchema = z.object({
	token: z.string().min(16).max(128),
	deviceToken: z.string().min(1).max(256).optional(),
})
export const ForgetPanelDeviceOutputSchema = z.void()

/** "Sair" (fase 2, item 6a) — this browser stops being anyone on this group's panel. Idempotent. */
@injectable()
export class ForgetPanelDevice extends Handler<typeof ForgetPanelDeviceInputSchema, typeof ForgetPanelDeviceOutputSchema> {
	readonly name = 'forget_panel_device' as const
	readonly inputSchema = ForgetPanelDeviceInputSchema
	readonly outputSchema = ForgetPanelDeviceOutputSchema

	constructor(private readonly store: PanelIdentityStore) {
		super()
	}

	protected async handle(input: this['input'], tx?: Transaction): Promise<void> {
		const group = await this.store.groupByToken(input.token, tx)
		if (!group) throw new BaseError<ApplicationErrors>('PANEL_NOT_FOUND', 'no panel for this link')
		if (!input.deviceToken) return
		const tokenHash = panelDeviceTokenHash(input.deviceToken)
		const session = await this.store.findSession(tokenHash, tx)
		// Only a session of THIS group: another group's link cannot end a device's session elsewhere.
		if (session?.threadId === group.threadId) await this.store.deleteSession(tokenHash, tx)
	}
}
