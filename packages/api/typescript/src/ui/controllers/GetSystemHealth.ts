import { injectable } from 'tsyringe-neo'
import { Controller, HttpStatusCode, z } from '@codm/core-typescript'
import { ProviderLimitWindow, QuotaState, SlotLimit } from '@codm/contracts-typescript/wire/enums'
import { CloudSessionMiddleware } from '@shared/middlewares'
import { GetSystemHealth, GetSystemHealthOutputSchema } from '../usecases/GetSystemHealth'

export const GetSystemHealthControllerInputSchema = z
	.object({ ctx: z.object({ ownerId: z.uuid() }) })
	.example([{ ctx: { ownerId: '00000000-0000-4000-8000-000000000001' } }])

export const GetSystemHealthControllerOutputSchema = GetSystemHealthOutputSchema.example([
	{
		state: QuotaState.NEAR,
		window: { spent: 18_400_000, ceiling: 40_000_000, reserve: 7_440_000, resetsAt: '2026-11-19T18:00:00.000Z' },
		week: { spent: 310_000_000, ceiling: 420_000_000, resetsAt: '2026-11-22T12:00:00.000Z' },
		slots: { inUse: 3, max: 6, effective: 4, limitedBy: SlotLimit.MACHINE },
		queue: { pending: 5, heldByBudget: 0 },
		diskFreeBytes: 12_884_901_888,
		budget: { enforced: false, admits: false, heldBy: ProviderLimitWindow.FIVE_HOUR },
	},
])

/**
 * The system's quota HEALTH for the console's strip (fase 4, item 7): the badge, the five-hour and weekly
 * windows (spend, learned ceiling, the orchestrator's reserve), the task slots and what limits them, the
 * queue and the free disk, and what the budget would do with one more task turn (enforced or only observed).
 * Console-only — no MCP scope.
 */
@injectable()
export class GetSystemHealthController extends Controller<
	typeof GetSystemHealthControllerInputSchema,
	typeof GetSystemHealthControllerOutputSchema
> {
	// Último segmento NÃO pode ser `health`: scripts/release/smoke-sidecars.ts (healthPathOf) acha o
	// health do daemon como o único path do openapi.json que termina em `/health`.
	readonly path = '/ui/system-health'
	readonly method = 'get' as const
	readonly description = 'Quota health: both windows, task slots and their limit, queue, free disk'
	readonly inputSchema = GetSystemHealthControllerInputSchema
	readonly outputSchema = GetSystemHealthControllerOutputSchema
	override middlewares = [CloudSessionMiddleware]
	constructor(private query: GetSystemHealth) {
		super()
	}
	async handle(request: this['input']): Promise<this['output']> {
		const data = await this.query.execute({ ownerId: request.ctx.ownerId })
		return { status: HttpStatusCode.OK, data }
	}
}
