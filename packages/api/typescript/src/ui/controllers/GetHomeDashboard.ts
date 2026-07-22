import { injectable } from 'tsyringe-neo'
import { Controller, HttpStatusCode, z } from '@template/core-typescript'
import { OperatorMiddleware } from '@auth/middlewares'
import { GetHomeDashboard, GetHomeDashboardOutputSchema } from '../usecases/GetHomeDashboard'

export const GetHomeDashboardControllerInputSchema = z.object({ ctx: z.object({ ownerId: z.uuid() }) })
export const GetHomeDashboardControllerOutputSchema = GetHomeDashboardOutputSchema

@injectable()
export class GetHomeDashboardController extends Controller<
	typeof GetHomeDashboardControllerInputSchema,
	typeof GetHomeDashboardControllerOutputSchema
> {
	readonly path = '/ui/home'
	readonly method = 'get' as const
	readonly description = 'Home dashboard — agents running, needs-you, active sessions, today metrics, channels (T03)'
	readonly inputSchema = GetHomeDashboardControllerInputSchema
	readonly outputSchema = GetHomeDashboardControllerOutputSchema

	override middlewares = [OperatorMiddleware]

	constructor(private query: GetHomeDashboard) {
		super()
	}

	async handle(request: this['input']): Promise<this['output']> {
		const data = await this.query.execute({ ownerId: request.ctx.ownerId })
		return { status: HttpStatusCode.OK, data }
	}
}
