import { injectable } from 'tsyringe-neo'
import { Controller, HttpStatusCode, z } from '@codm/core-typescript'
import { IssueControlSource } from '@codm/contracts-typescript/wire/enums'
import { CloudSessionMiddleware } from '@shared/middlewares'
import { PauseIssue, PauseIssueOutputSchema } from '../usecases/PauseIssue'
import { IssueParam } from '../schemas'

/**
 * The per-issue envelope plus the console USER `CloudSessionMiddleware` stamps — composed so Zod does not
 * strip it, because the pause records who asked. Optional: the hold must not depend on the session
 * carrying a profile.
 */
export const IssueControlControllerInputSchema = IssueParam.extend({
	ctx: IssueParam.shape.ctx.extend({ user: z.object({ id: z.string(), name: z.string().optional() }).optional() }),
}).example([
	{
		ctx: { ownerId: '00000000-0000-4000-8000-000000000001', user: { id: 'user-123', name: 'Operator' } },
		params: { issueId: '019e4d24-6524-7041-9e1c-8108180cddaf' },
	},
])
export const PauseIssueControllerOutputSchema = PauseIssueOutputSchema

/** Hold an issue's work from the console (fase 2, item 2) — the button twin of "pare" in the group. */
@injectable()
export class PauseIssueController extends Controller<typeof IssueControlControllerInputSchema, typeof PauseIssueControllerOutputSchema> {
	readonly path = '/issues/:issueId/pause'
	readonly method = 'post' as const
	readonly description = 'Pause an issue: its turns stop and its external tools refuse until it is resumed'
	readonly inputSchema = IssueControlControllerInputSchema
	readonly outputSchema = PauseIssueControllerOutputSchema
	override middlewares = [CloudSessionMiddleware]
	constructor(private useCase: PauseIssue) {
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
