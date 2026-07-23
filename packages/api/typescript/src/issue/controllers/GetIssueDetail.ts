import { injectable } from 'tsyringe-neo'
import { Controller, HttpStatusCode } from '@codedm/core-typescript'
import { OperatorMiddleware } from '@auth/middlewares'
import { GetIssueDetail, GetIssueDetailOutputSchema } from '../usecases/GetIssueDetail'
import { IssueParam } from '../schemas'

export const GetIssueDetailControllerInputSchema = IssueParam.example([
	{ ctx: { ownerId: '00000000-0000-4000-8000-000000000001' }, params: { issueId: '019e4d24-6524-7041-9e1c-8108180cddaf' } },
])
export const GetIssueDetailControllerOutputSchema = GetIssueDetailOutputSchema

// T12
@injectable()
export class GetIssueDetailController extends Controller<
	typeof GetIssueDetailControllerInputSchema,
	typeof GetIssueDetailControllerOutputSchema
> {
	readonly path = '/issues/:issueId'
	readonly method = 'get' as const
	readonly description = 'One issue drill-down: terminal log, routed messages, stops (T12)'
	readonly inputSchema = GetIssueDetailControllerInputSchema
	readonly outputSchema = GetIssueDetailControllerOutputSchema
	override middlewares = [OperatorMiddleware]
	constructor(private query: GetIssueDetail) {
		super()
	}
	async handle(request: this['input']): Promise<this['output']> {
		const data = await this.query.execute({ ownerId: request.ctx.ownerId, issueId: request.params.issueId })
		return { status: HttpStatusCode.OK, data }
	}
}
