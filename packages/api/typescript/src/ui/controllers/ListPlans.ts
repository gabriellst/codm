import { injectable } from 'tsyringe-neo'
import { Controller, HttpStatusCode, z } from '@template/core-typescript'
import { CurrencyCode } from '@template/contracts-typescript/wire/enums'

import { ListPlans, ListPlansOutputSchema } from '../usecases/billing/ListPlans'
import { PlanName, QuotaKey } from '@template/contracts-typescript/wire/enums'

export const ListPlansControllerInput = z.object({}).example([{}])
export const ListPlansControllerOutput = ListPlansOutputSchema.example([
	{
		plans: [
			{
				name: PlanName.PRO,
				basePrice: { amountCents: 29900, currency: CurrencyCode.BRL },
				quotas: {
					[QuotaKey.EXAMPLE_KEY]: { limit: 5000, metered: true },
				},
			},
		],
	},
])

@injectable()
export class ListPlansController extends Controller<typeof ListPlansControllerInput, typeof ListPlansControllerOutput> {
	readonly path = '/ui/billing/plans'
	readonly method = 'get' as const
	readonly description = 'List available billing plans'
	readonly inputSchema = ListPlansControllerInput
	readonly outputSchema = ListPlansControllerOutput

	// Public endpoint — the plan catalog is not owner-scoped (the UI context applies no default middlewares).
	override middlewares = []

	constructor(private listPlans: ListPlans) {
		super()
	}

	async handle(_request: this['input']): Promise<this['output']> {
		const data = await this.listPlans.execute({})
		return { status: HttpStatusCode.OK, data }
	}
}
