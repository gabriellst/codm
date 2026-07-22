// CONTEXT-ORIGIN: template@feat/template-polyglot (2026-07-01) — Tier-3 exemplar, not live code
// ORIGIN-FILE: packages/api/typescript/src/ui/entities/StoreVisualization.ts

import { AggregateRoot, Id, z } from '@template/core-typescript'
import Z from 'zod'
import { DashboardMode } from '@template/contracts-typescript/wire/enums'

export const StoreVisualizationSchema = z.object({
	storeId: z.instance(Id),
	dashboardMode: z.enum(DashboardMode),
})

export type StoreVisualizationProps = Z.infer<typeof StoreVisualizationSchema>

/**
 * `StoreVisualization` aggregate — persists the per-store dashboard
 * visualization mode (GLOBAL | NATIONAL). One row per store.
 *
 * Used by GetDashboard to pick the correct discriminated-union variant
 * without a query param. SetStoreVisualization upserts it.
 */
export class StoreVisualization extends AggregateRoot<typeof StoreVisualizationSchema> {
	static override schema = StoreVisualizationSchema

	static create(data: { storeId: string; dashboardMode?: DashboardMode }): StoreVisualization {
		return new StoreVisualization({
			storeId: data.storeId,
			dashboardMode: data.dashboardMode ?? DashboardMode.GLOBAL,
		})
	}

	/** Change the persisted dashboard mode for this store. */
	changeMode(mode: DashboardMode): void {
		this.dashboardMode = mode
		this.validate()
	}
}

export interface StoreVisualization extends StoreVisualizationProps {}
