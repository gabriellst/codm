import { injectable } from 'tsyringe-neo'
import { Controller, HttpStatusCode, z } from '@codedm/core-typescript'
import { OperatorMiddleware } from '@auth/middlewares'
import { GetSetupChecklist, GetSetupChecklistOutputSchema } from '../usecases/GetSetupChecklist'

export const GetSetupChecklistControllerInputSchema = z.object({ ctx: z.object({ ownerId: z.uuid() }) })
export const GetSetupChecklistControllerOutputSchema = GetSetupChecklistOutputSchema

@injectable()
export class GetSetupChecklistController extends Controller<
	typeof GetSetupChecklistControllerInputSchema,
	typeof GetSetupChecklistControllerOutputSchema
> {
	readonly path = '/ui/setup-checklist'
	readonly method = 'get' as const
	readonly description = 'Onboarding checklist — channel/workspace/thread done flags (cross-context)'
	readonly inputSchema = GetSetupChecklistControllerInputSchema
	readonly outputSchema = GetSetupChecklistControllerOutputSchema

	override middlewares = [OperatorMiddleware]

	constructor(private query: GetSetupChecklist) {
		super()
	}

	async handle(request: this['input']): Promise<this['output']> {
		const data = await this.query.execute({ ownerId: request.ctx.ownerId })
		return { status: HttpStatusCode.OK, data }
	}
}
