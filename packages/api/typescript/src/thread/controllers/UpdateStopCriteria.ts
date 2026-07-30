import { injectable } from 'tsyringe-neo'
import { Controller, HttpStatusCode, z } from '@codedm/core-typescript'
import { OperatorMiddleware } from '@auth/middlewares'
import {
	UpdateStopCriteriaConfig,
	UpdateStopCriteriaConfigInputSchema,
	UpdateStopCriteriaConfigOutputSchema,
} from '../usecases/UpdateStopCriteriaConfig'

export const UpdateStopCriteriaControllerInputSchema = z
	.object({
		ctx: z.object({ ownerId: z.uuid() }),
		body: UpdateStopCriteriaConfigInputSchema.pick({ stopCriteria: true }),
	})
	.example([
		{
			ctx: { ownerId: '00000000-0000-4000-8000-000000000001' },
			body: {
				stopCriteria: { serverErrors: true, blockedByClassification: true, humanRequested: true, approvalNeeded: true, authRequired: true },
			},
		},
	])
export const UpdateStopCriteriaControllerOutputSchema = UpdateStopCriteriaConfigOutputSchema

// C29
@injectable()
export class UpdateStopCriteriaController extends Controller<
	typeof UpdateStopCriteriaControllerInputSchema,
	typeof UpdateStopCriteriaControllerOutputSchema
> {
	readonly path = '/settings/stop-criteria'
	readonly method = 'put' as const
	readonly description = 'Update the global stop-criteria toggles (C29)'
	readonly inputSchema = UpdateStopCriteriaControllerInputSchema
	readonly outputSchema = UpdateStopCriteriaControllerOutputSchema
	override middlewares = [OperatorMiddleware]
	constructor(private useCase: UpdateStopCriteriaConfig) {
		super()
	}
	async handle(request: this['input']): Promise<this['output']> {
		await this.useCase.execute({ ownerId: request.ctx.ownerId, stopCriteria: request.body.stopCriteria })
		return { status: HttpStatusCode.NO_CONTENT, data: undefined }
	}
}
