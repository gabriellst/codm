import { injectable } from 'tsyringe-neo'
import { Controller, HttpStatusCode, z } from '@codm/core-typescript'
import { ListPanelMembers, ListPanelMembersInputSchema, ListPanelMembersOutputSchema } from '../usecases/ListPanelMembers'

export const ListPanelMembersControllerInputSchema = z
	.object({ params: ListPanelMembersInputSchema })
	.example([{ params: { token: 'kq3pE1aV0m9xT2yR8wB5nC7dF4gH6jL1sZ0uQ3iO9eA' } }])
export const ListPanelMembersControllerOutputSchema = ListPanelMembersOutputSchema

/** PUBLIC — the names a visitor picks from to identify themselves, by the group's panel link token. */
@injectable()
export class ListPanelMembersController extends Controller<
	typeof ListPanelMembersControllerInputSchema,
	typeof ListPanelMembersControllerOutputSchema
> {
	readonly path = '/panel/g/:token/members'
	readonly method = 'get' as const
	readonly description = 'The people of a group (opaque id + name), by its panel link token (public)'
	readonly inputSchema = ListPanelMembersControllerInputSchema
	readonly outputSchema = ListPanelMembersControllerOutputSchema
	constructor(private query: ListPanelMembers) {
		super()
	}
	async handle(request: this['input']): Promise<this['output']> {
		const data = await this.query.execute({ token: request.params.token })
		return { status: HttpStatusCode.OK, data, headers: { 'Cache-Control': 'no-store', 'Referrer-Policy': 'no-referrer' } }
	}
}
