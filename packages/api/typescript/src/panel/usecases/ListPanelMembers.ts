import { injectable } from 'tsyringe-neo'
import { Handler, z, BaseError } from '@codm/core-typescript'
import { PanelIdentityStore } from '../services/PanelIdentityStore'
import { PanelMemberSchema } from './SyncPanelRoster'
import type { ApplicationErrors } from '../errors'

export const ListPanelMembersInputSchema = z.object({ token: z.string().min(16).max(128) })
export const ListPanelMembersOutputSchema = z.object({
	/** Names to pick from — the grant stays out of the public list. */
	members: z.array(PanelMemberSchema.pick({ memberId: true, name: true })),
})

/** Query — the people of ONE group, by its link token (public), for "Identificar-me" (fase 2, item 6a). */
@injectable()
export class ListPanelMembers extends Handler<typeof ListPanelMembersInputSchema, typeof ListPanelMembersOutputSchema> {
	readonly name = 'list_panel_members' as const
	readonly inputSchema = ListPanelMembersInputSchema
	readonly outputSchema = ListPanelMembersOutputSchema

	constructor(private readonly store: PanelIdentityStore) {
		super()
	}

	protected async handle(input: this['input']): Promise<this['output']> {
		const group = await this.store.groupByToken(input.token)
		if (!group) throw new BaseError<ApplicationErrors>('PANEL_NOT_FOUND', 'no panel for this link')
		return { members: group.members.map(member => ({ memberId: member.memberId, name: member.name })) }
	}
}
