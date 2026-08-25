import { injectable } from 'tsyringe-neo'
import { Controller, HttpStatusCode } from '@codm/core-typescript'
import { CloudSessionMiddleware } from '@shared/middlewares'
import { SteerIssue, SteerIssueInputSchema, SteerIssueOutputSchema } from '../usecases/SteerIssue'
import { IssueParam } from '../schemas'

// Body COMPOSED from the use case input (single source) — the whisper text only.
export const SteerIssueControllerInputSchema = IssueParam.extend({ body: SteerIssueInputSchema.pick({ text: true }) }).example([
	{
		ctx: { ownerId: '00000000-0000-4000-8000-000000000001' },
		params: { issueId: '019e4d24-6524-7041-9e1c-8108180cddaf' },
		body: { text: 'prefer the smaller refactor' },
	},
])
export const SteerIssueControllerOutputSchema = SteerIssueOutputSchema.example([{ entryId: '019e4d24-6524-7041-9e1c-8108180cddb0' }])

// C22
@injectable()
export class SteerIssueController extends Controller<typeof SteerIssueControllerInputSchema, typeof SteerIssueControllerOutputSchema> {
	readonly path = '/issues/:issueId/steer'
	readonly method = 'post' as const
	readonly description = 'Whisper a steer scoped to one issue (C22)'
	readonly inputSchema = SteerIssueControllerInputSchema
	readonly outputSchema = SteerIssueControllerOutputSchema
	override middlewares = [CloudSessionMiddleware]
	constructor(private useCase: SteerIssue) {
		super()
	}
	async handle(request: this['input']): Promise<this['output']> {
		const data = await this.useCase.execute({ ownerId: request.ctx.ownerId, issueId: request.params.issueId, text: request.body.text })
		return { status: HttpStatusCode.CREATED, data }
	}
}
