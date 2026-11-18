import { injectable } from 'tsyringe-neo'
import { Controller, HttpStatusCode } from '@codm/core-typescript'
import { IssueControlSource } from '@codm/contracts-typescript/wire/enums'
import { CloudSessionMiddleware } from '@shared/middlewares'
import { ResumeIssue, ResumeIssueOutputSchema } from '../usecases/ResumeIssue'
import { IssueControlControllerInputSchema } from './PauseIssue'

export const ResumeIssueControllerOutputSchema = ResumeIssueOutputSchema

/** Lift the hold on an issue from the console (fase 2, item 2) — the button twin of "continue". */
@injectable()
export class ResumeIssueController extends Controller<typeof IssueControlControllerInputSchema, typeof ResumeIssueControllerOutputSchema> {
	readonly path = '/issues/:issueId/resume'
	readonly method = 'post' as const
	readonly description = 'Resume a paused issue: its held work continues now'
	readonly inputSchema = IssueControlControllerInputSchema
	readonly outputSchema = ResumeIssueControllerOutputSchema
	override middlewares = [CloudSessionMiddleware]
	constructor(private useCase: ResumeIssue) {
		super()
	}
	async handle(request: this['input']): Promise<this['output']> {
		await this.useCase.execute({
			ownerId: request.ctx.ownerId,
			issueId: request.params.issueId,
			source: IssueControlSource.CONSOLE,
			requestedBy: request.ctx.user?.name,
			requestedById: request.ctx.user?.id,
		})
		return { status: HttpStatusCode.NO_CONTENT, data: undefined }
	}
}
