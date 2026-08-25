import { injectable } from 'tsyringe-neo'
import { Controller, HttpStatusCode } from '@codm/core-typescript'
import { IssueArchiveReason } from '@codm/contracts-typescript/wire/enums'
import { CloudSessionMiddleware } from '@shared/middlewares'
import { ArchiveIssue, ArchiveIssueOutputSchema } from '../usecases/ArchiveIssue'
import { IssueParam } from '../schemas'

export const ArchiveIssueControllerInputSchema = IssueParam.example([
	{ ctx: { ownerId: '00000000-0000-4000-8000-000000000001' }, params: { issueId: '019e4d24-6524-7041-9e1c-8108180cddaf' } },
])
export const ArchiveIssueControllerOutputSchema = ArchiveIssueOutputSchema

// C26
@injectable()
export class ArchiveIssueController extends Controller<
	typeof ArchiveIssueControllerInputSchema,
	typeof ArchiveIssueControllerOutputSchema
> {
	readonly path = '/issues/:issueId/archive'
	readonly method = 'post' as const
	readonly description = 'Archive an issue (C26)'
	readonly inputSchema = ArchiveIssueControllerInputSchema
	readonly outputSchema = ArchiveIssueControllerOutputSchema
	override middlewares = [CloudSessionMiddleware]
	constructor(private useCase: ArchiveIssue) {
		super()
	}
	async handle(request: this['input']): Promise<this['output']> {
		await this.useCase.execute({ ownerId: request.ctx.ownerId, issueId: request.params.issueId, reason: IssueArchiveReason.MANUAL })
		return { status: HttpStatusCode.NO_CONTENT, data: undefined }
	}
}
