// CONTEXT-ORIGIN · APPROVED pair · examples/pairs/synthetic-store-visualization-event
// task:        synthetic-store-visualization-event
// stamp:       agent-wave1-38ff876
// docTreeHash: c7182ff522b7
// model:       default
// graded:      2026-07-21T18:43:06.075Z
// source:      packages/api/typescript/src/ui/events/StoreVisualizationUpdatedEvent.ts (archived eval build, applied at HEAD)
// Verbatim extract of the archived eval build — NOT a live module. Do not import it.
import { BaseDomainEvent, z } from '@codedm/core-typescript'
import { DashboardMode } from '../enums'

const StoreVisualizationUpdatedEventSchema = z.domainEvent({
	storeId: z.uuid(),
	dashboardMode: z.enum(DashboardMode),
})

export class StoreVisualizationUpdatedEvent extends BaseDomainEvent<typeof StoreVisualizationUpdatedEventSchema> {
	static override readonly name = 'ui.store_visualization.updated' as const
	static readonly schema = StoreVisualizationUpdatedEventSchema
}
