import { injectable } from 'tsyringe-neo'
import { Controller, HttpStatusCode, z } from '@codm/core-typescript'
import { CloudSessionMiddleware } from '@shared/middlewares'
import {
	SetParticipantElevation,
	SetParticipantElevationInputSchema,
	SetParticipantElevationOutputSchema,
} from '../usecases/ConfigureThreadSettings'

export const SetParticipantElevationControllerInputSchema = z
	.object({
		ctx: z.object({ ownerId: z.uuid() }),
		params: SetParticipantElevationInputSchema.pick({ threadId: true, participantId: true }),
		body: SetParticipantElevationInputSchema.pick({ canElevate: true }),
	})
	.example([
		{
			ctx: { ownerId: '00000000-0000-4000-8000-000000000001' },
			params: { threadId: '019e4d24-6524-7041-9e1c-8108180cddae', participantId: '5511999999999' },
			body: { canElevate: true },
		},
	])
export const SetParticipantElevationControllerOutputSchema = SetParticipantElevationOutputSchema

/**
 * The console's second per-participant toggle (participant-permission-posture, Decision 3) — whether
 * an order from this person runs the turn with no permission filter. Molded on
 * `SetParticipantInvocationController`: same door shape, same admission of a live group member the JSON
 * roster never recorded, a separate sub-resource because it is a separate grant.
 *
 * NOT an MCP tool, on purpose: no `static mcpScopes`. Granting elevation is the operator's decision in
 * the console; an agent that could call it could elevate itself.
 */
@injectable()
export class SetParticipantElevationController extends Controller<
	typeof SetParticipantElevationControllerInputSchema,
	typeof SetParticipantElevationControllerOutputSchema
> {
	readonly path = '/threads/:threadId/participants/:participantId/elevation'
	readonly method = 'put' as const
	readonly description = 'Toggle whether an order from a participant runs with no permission filter'
	readonly inputSchema = SetParticipantElevationControllerInputSchema
	readonly outputSchema = SetParticipantElevationControllerOutputSchema
	override middlewares = [CloudSessionMiddleware]
	constructor(private useCase: SetParticipantElevation) {
		super()
	}
	async handle(request: this['input']): Promise<this['output']> {
		await this.useCase.execute({
			ownerId: request.ctx.ownerId,
			threadId: request.params.threadId,
			participantId: request.params.participantId,
			canElevate: request.body.canElevate,
		})
		return { status: HttpStatusCode.NO_CONTENT, data: undefined }
	}
}
