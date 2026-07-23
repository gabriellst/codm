import { injectable } from 'tsyringe-neo'
import { Controller, HttpStatusCode } from '@codedm/core-typescript'
import { OperatorMiddleware } from '@auth/middlewares'
import { RestoreIssue, RestoreIssueOutputSchema } from '../usecases/RestoreIssue'
import { IssueParam } from '../schemas'

export const RestoreIssueControllerInputSchema = IssueParam.example([
	{ ctx: { ownerId: '00000000-0000-4000-8000-000000000001' }, params: { issueId: '019e4d24-6524-7041-9e1c-8108180cddaf' } },
])
export const RestoreIssueControllerOutputSchema = RestoreIssueOutputSchema

// C27
@injectable()
export class RestoreIssueController extends Controller<
	typeof RestoreIssueControllerInputSchema,
	typeof RestoreIssueControllerOutputSchema
> {
	readonly path = '/issues/:issueId/restore'
	readonly method = 'post' as const
	readonly description = 'Restore an archived issue (C27)'
	readonly inputSchema = RestoreIssueControllerInputSchema
	readonly outputSchema = RestoreIssueControllerOutputSchema
	override middlewares = [OperatorMiddleware]
	constructor(private useCase: RestoreIssue) {
		super()
	}
	async handle(request: this['input']): Promise<this['output']> {
		await this.useCase.execute({ ownerId: request.ctx.ownerId, issueId: request.params.issueId })
		return { status: HttpStatusCode.NO_CONTENT, data: undefined }
	}
}
