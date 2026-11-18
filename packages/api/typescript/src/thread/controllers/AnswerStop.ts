import { injectable } from 'tsyringe-neo'
import { BaseError, Controller, z } from '@codm/core-typescript'
import { AskAnswerKind } from '@codm/contracts-typescript/wire/enums'
import { AskAnswerSchema } from '@shared/objects'
import { CloudSessionMiddleware } from '@shared/middlewares'
import type { ApplicationErrors } from '../errors'

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
 * DECLARED, NOT YET WIRED (slice S0b): the route and its SDK hook exist so the console can be built
 * against them; the resolution itself (`ResolveStop` with `ANSWER`, first answer wins) lands in S3.
 * Until then it refuses with `OUTPUT_POLICY_NOT_READY` — never a silent success.
 */
@injectable()
export class AnswerStopController extends Controller<typeof AnswerStopControllerInputSchema, typeof AnswerStopControllerOutputSchema> {
	readonly path = '/stops/:stopId/answer'
	readonly method = 'post' as const
	readonly description = "Answer an issue's decision or question with one of its options or free text"
	readonly inputSchema = AnswerStopControllerInputSchema
	readonly outputSchema = AnswerStopControllerOutputSchema
	override middlewares = [CloudSessionMiddleware]
	async handle(_request: this['input']): Promise<this['output']> {
		throw new BaseError<ApplicationErrors>('OUTPUT_POLICY_NOT_READY', 'answering an ask lands in fase 3, slice S3')
	}
}
