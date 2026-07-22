// CONTEXT-ORIGIN · APPROVED pair · examples/pairs/synthetic-store-visualization-event
// task:        synthetic-store-visualization-event
// stamp:       agent-wave1-38ff876
// docTreeHash: c7182ff522b7
// model:       default
// graded:      2026-07-21T18:43:06.075Z
// source:      packages/api/typescript/src/ui/usecases/SetStoreVisualization.ts (archived eval build, applied at HEAD)
// Verbatim extract of the archived eval build — NOT a live module. Do not import it.
import { injectable } from 'tsyringe-neo'
import { Handler, z } from '@codedm/core-typescript'
import type { Transaction } from '@codedm/core-typescript'
import { StoreVisualization } from '@ui/entities'
import { DashboardMode } from '@ui/enums'
import { StoreVisualizationUpdatedEvent } from '../events'
import { StoreVisualizationRepository } from '../repositories/StoreVisualizationRepository'

export const SetStoreVisualizationInputSchema = z.object({
	storeId: z.uuid(),
	dashboardMode: z.enum(DashboardMode),
})

export const SetStoreVisualizationOutputSchema = z.object({
	storeId: z.uuid(),
	dashboardMode: z.enum(DashboardMode),
})

@injectable()
export class SetStoreVisualization extends Handler<typeof SetStoreVisualizationInputSchema, typeof SetStoreVisualizationOutputSchema> {
	readonly name = 'set_store_visualization' as const
	readonly inputSchema = SetStoreVisualizationInputSchema
	readonly outputSchema = SetStoreVisualizationOutputSchema

	constructor(private readonly storeVisualizationRepo: StoreVisualizationRepository) {
		super()
	}

	protected async handle(input: this['input'], tx?: Transaction): Promise<this['output']> {
		return this.withTransaction(tx, async tx => {
			// Upsert — one row per store: mutate the existing aggregate or create it.
			const existing = await this.storeVisualizationRepo.findByStoreId(input.storeId, tx)
			let visualization: StoreVisualization
			if (existing) {
				existing.changeMode(input.dashboardMode)
				visualization = existing
			} else {
				visualization = StoreVisualization.create({ storeId: input.storeId, dashboardMode: input.dashboardMode })
			}

			await this.storeVisualizationRepo.save(visualization, tx)

			// Same transaction as the entity save — the OutboxDispatcher delivers it.
			await this.domainEventRepository.save(
				new StoreVisualizationUpdatedEvent({
					entityId: visualization.id.value,
					// The store is the tenancy scope of this per-store preference.
					ownerId: input.storeId,
					payload: {
						storeId: input.storeId,
						dashboardMode: input.dashboardMode,
					},
				}),
				tx,
			)

			return { storeId: input.storeId, dashboardMode: input.dashboardMode }
		})
	}
}
