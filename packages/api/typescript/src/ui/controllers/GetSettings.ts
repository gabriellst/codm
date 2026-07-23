import { injectable } from 'tsyringe-neo'
import { Controller, HttpStatusCode, z } from '@codedm/core-typescript'
import { OperatorMiddleware } from '@auth/middlewares'
import { GetSettings, GetSettingsOutputSchema } from '../usecases/GetSettings'

export const GetSettingsControllerInputSchema = z
	.object({ ctx: z.object({ ownerId: z.uuid() }) })
	.example([{ ctx: { ownerId: '00000000-0000-4000-8000-000000000001' } }])
export const GetSettingsControllerOutputSchema = GetSettingsOutputSchema

@injectable()
export class GetSettingsController extends Controller<typeof GetSettingsControllerInputSchema, typeof GetSettingsControllerOutputSchema> {
	readonly path = '/ui/settings'
	readonly method = 'get' as const
	readonly description = 'Settings — providers, stop criteria, general, app version (T08)'
	readonly inputSchema = GetSettingsControllerInputSchema
	readonly outputSchema = GetSettingsControllerOutputSchema

	override middlewares = [OperatorMiddleware]

	constructor(private query: GetSettings) {
		super()
	}

	async handle(request: this['input']): Promise<this['output']> {
		const data = await this.query.execute({ ownerId: request.ctx.ownerId })
		return { status: HttpStatusCode.OK, data }
	}
}
