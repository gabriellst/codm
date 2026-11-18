import { injectable } from 'tsyringe-neo'
import { Handler, z, BaseError } from '@codm/core-typescript'
import { PanelActionKind, PanelActionStatus } from '@codm/contracts-typescript/wire/enums'
import { PanelIdentityStore } from '../services/PanelIdentityStore'
import { PanelActionStore } from '../services/PanelActionStore'
import { panelActionStatus } from '../utils/panelActions'
import type { ApplicationErrors } from '../errors'
import { resolvePanelDevice } from './panelDevice'

export const GetPanelActionInputSchema = z.object({
	token: z.string().min(16).max(128),
	deviceToken: z.string().min(1).max(256).optional(),
	actionId: z.uuid(),
})
export const GetPanelActionOutputSchema = z.object({
	actionId: z.uuid(),
	kind: z.enum(PanelActionKind),
	status: z.enum(PanelActionStatus),
	/** Why the daemon refused — an error code, present only when REFUSED. */
	code: z.string().optional(),
})

/**
 * Query — where one panel action stands (fase 2, item 6b), for the page to poll: PENDING until the daemon
 * reports, then DONE or REFUSED (with the code); EXPIRED when no outcome came back in time.
 *
 * Only the member who asked, on the group it was asked on, sees it; anything else answers PANEL_NOT_FOUND,
 * like a foreign link.
 */
@injectable()
export class GetPanelAction extends Handler<typeof GetPanelActionInputSchema, typeof GetPanelActionOutputSchema> {
	readonly name = 'get_panel_action' as const
	readonly inputSchema = GetPanelActionInputSchema
	readonly outputSchema = GetPanelActionOutputSchema

	constructor(
		private readonly identities: PanelIdentityStore,
		private readonly actions: PanelActionStore,
	) {
		super()
	}

	protected async handle(input: this['input']): Promise<this['output']> {
		const { group, member } = await resolvePanelDevice(this.identities, input.token, input.deviceToken)
		const action = group && member ? await this.actions.find(input.actionId) : undefined
		if (!group || !member || !action || action.threadId !== group.threadId || action.memberId !== member.memberId) {
			throw new BaseError<ApplicationErrors>('PANEL_NOT_FOUND', 'no panel for this link')
		}
		const status = panelActionStatus(action, new Date())
		return {
			actionId: action.id,
			kind: action.kind,
			status,
			code: status === PanelActionStatus.REFUSED ? (action.outcomeCode ?? undefined) : undefined,
		}
	}
}
