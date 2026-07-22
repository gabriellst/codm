import { injectable } from 'tsyringe-neo'
import { Controller, HttpStatusCode, z } from '@template/core-typescript'
import { AuthAccountMiddleware } from '@auth/middlewares/AuthAccountMiddleware'
import { RequireOwner } from '@owner/middlewares'

import { GetUsage, GetUsageOutputSchema } from '../usecases/billing/GetUsage'
import { QuotaKey } from '@template/contracts-typescript/wire/enums'

export const GetUsageControllerInput = z
	.object({
		ctx: z.object({
			session: z.object({
				ownerId: z.string(),
			}),
		}),
	})
	.example([{ ctx: { session: { ownerId: 'owner-uuid' } } }])

export const GetUsageControllerOutput = GetUsageOutputSchema.example([
	{
		quotas: [{ key: QuotaKey.EXAMPLE_KEY, used: 42, included: 5000 }],
	},
])

@injectable()
export class GetUsageController extends Controller<typeof GetUsageControllerInput, typeof GetUsageControllerOutput> {
	readonly path = '/ui/billing/usage'
	readonly method = 'get' as const
	readonly description = 'Get quota usage for the authenticated owner'
	readonly inputSchema = GetUsageControllerInput
	readonly outputSchema = GetUsageControllerOutput

	override middlewares = [AuthAccountMiddleware, RequireOwner]

	constructor(private getUsage: GetUsage) {
		super()
	}

	async handle(request: this['input']): Promise<this['output']> {
		const data = await this.getUsage.execute({ ownerId: request.ctx.session.ownerId })

		return {
			status: HttpStatusCode.OK,
			data,
		}
	}
}
