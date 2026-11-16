import { injectable } from 'tsyringe-neo'
import { Controller, HttpStatusCode, z } from '@codm/core-typescript'
import { GetPanelIssue, GetPanelIssueInputSchema, GetPanelIssueOutputSchema } from '../usecases/GetPanelIssue'

export const GetPanelIssueControllerInputSchema = z
	.object({ params: GetPanelIssueInputSchema })
	.example([{ params: { token: 'kq3pE1aV0m9xT2yR8wB5nC7dF4gH6jL1sZ0uQ3iO9eA', issueId: '019e4d24-6524-7041-9e1c-8108180cddb0' } }])
export const GetPanelIssueControllerOutputSchema = GetPanelIssueOutputSchema

/** PUBLIC — one issue of a group with its timeline, by the group's panel link token. */
@injectable()
export class GetPanelIssueController extends Controller<
	typeof GetPanelIssueControllerInputSchema,
	typeof GetPanelIssueControllerOutputSchema
> {
	readonly path = '/panel/g/:token/issues/:issueId'
	readonly method = 'get' as const
	readonly description = "One issue of a group with its timeline, by the group's panel link token (public)"
	readonly inputSchema = GetPanelIssueControllerInputSchema
	readonly outputSchema = GetPanelIssueControllerOutputSchema
	constructor(private query: GetPanelIssue) {
		super()
	}
	async handle(request: this['input']): Promise<this['output']> {
		const data = await this.query.execute({ token: request.params.token, issueId: request.params.issueId })
		return { status: HttpStatusCode.OK, data }
	}
}
