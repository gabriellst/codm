import { injectable } from 'tsyringe-neo'
import { Controller, HttpStatusCode, z } from '@codm/core-typescript'
import { AskAnswerKind } from '@codm/contracts-typescript/wire/enums'
import { AskAnswerSchema } from '@shared/objects'
import { CloudSessionMiddleware } from '@shared/middlewares'
import { OPERATOR_PARTICIPANT_ID } from '../entities/Thread'
import { AnswerStop } from '../usecases/AnswerStop'

export const AnswerStopControllerInputSchema = z
	.object({
		ctx: z.object({ ownerId: z.uuid() }),
		params: z.object({ stopId: z.uuid() }),
		// The person's answer — an option of the ask, or free text. A discriminated union, so the console
		// renders one button per option and a text box only where the ask takes text (Non-Negotiable 3).
		body: AskAnswerSchema,
	})
	.example([
		{
			ctx: { ownerId: '00000000-0000-4000-8000-000000000001' },
			params: { stopId: '019e4d24-6524-7041-9e1c-8108180cddb1' },
			body: { kind: AskAnswerKind.OPTION, optionId: 'yes' },
		},
	])
export const AnswerStopControllerOutputSchema = z.void()

/**
 * Answer one of an issue's asks — a decision or a question — from the console (fase 3, item 3).
 *
 * The console is the owner, who answers as the `operator` participant of the stop's conversation — through
 * the same `AnswerStop` use case a reply in the group takes, so the ruler of who may answer and "the first
 * answer wins" are one rule for every door. A stop someone else answered first is `STOP_ALREADY_RESOLVED`.
 */
@injectable()
export class AnswerStopController extends Controller<typeof AnswerStopControllerInputSchema, typeof AnswerStopControllerOutputSchema> {
	readonly path = '/stops/:stopId/answer'
	readonly method = 'post' as const
	readonly description = "Answer an issue's decision or question with one of its options or free text"
	readonly inputSchema = AnswerStopControllerInputSchema
	readonly outputSchema = AnswerStopControllerOutputSchema
	override middlewares = [CloudSessionMiddleware]
	constructor(private useCase: AnswerStop) {
		super()
	}
	async handle(request: this['input']): Promise<this['output']> {
		await this.useCase.execute({
			ownerId: request.ctx.ownerId,
			stopId: request.params.stopId,
			answer: request.body,
			answeredBy: OPERATOR_PARTICIPANT_ID,
		})
		return { status: HttpStatusCode.NO_CONTENT, data: undefined }
	}
}
