import { injectable } from 'tsyringe-neo'
import { BaseError, Controller, z } from '@codm/core-typescript'
import { QuotaState, SlotLimit } from '@codm/contracts-typescript/wire/enums'
import { CloudSessionMiddleware } from '@shared/middlewares'
import { QuotaSnapshotSchema } from '@shared/objects'
import type { ApplicationErrors } from '../errors'

export const GetSystemHealthControllerInputSchema = z
	.object({ ctx: z.object({ ownerId: z.uuid() }) })
	.example([{ ctx: { ownerId: '00000000-0000-4000-8000-000000000001' } }])

export const GetSystemHealthControllerOutputSchema = QuotaSnapshotSchema.example([
	{
		state: QuotaState.NEAR,
		window: { spent: 18_400_000, ceiling: 40_000_000, reserve: 7_440_000, resetsAt: '2026-11-19T18:00:00.000Z' },
		week: { spent: 310_000_000, ceiling: 420_000_000, resetsAt: '2026-11-22T12:00:00.000Z' },
		slots: { inUse: 3, max: 6, effective: 4, limitedBy: SlotLimit.MACHINE },
		queue: { pending: 5, heldByBudget: 0 },
		diskFreeBytes: 12_884_901_888,
	},
])

/**
 * The system's quota HEALTH for the console's strip (fase 4, item 7): the badge, the five-hour and weekly
 * windows (spend, learned ceiling, the orchestrator's reserve), the task slots and what limits them, the
 * queue and the free disk. Console-only — no MCP scope.
 *
 * DECLARED, NOT YET WIRED (slice S0b, CTRL-C05 mock mode): the route answers the declared example so the
 * console builds against a real shape; the query (`GetSystemHealth`, reading `QuotaStatusReader`) lands in S9.
 */
@injectable()
export class GetSystemHealthController extends Controller<
	typeof GetSystemHealthControllerInputSchema,
	typeof GetSystemHealthControllerOutputSchema
> {
	override readonly mockController = true
	readonly path = '/ui/system/health'
	readonly method = 'get' as const
	readonly description = 'Quota health: both windows, task slots and their limit, queue, free disk'
	readonly inputSchema = GetSystemHealthControllerInputSchema
	readonly outputSchema = GetSystemHealthControllerOutputSchema
	override middlewares = [CloudSessionMiddleware]
	async handle(_request: this['input']): Promise<this['output']> {
		// Unreachable over HTTP while `mockController` is on; a direct `execute` must not invent a health.
		throw new BaseError<ApplicationErrors>('THROUGHPUT_NOT_READY', 'GetSystemHealth lands in fase 4, slice S9')
	}
}
