// CONTEXT-ORIGIN: template@feat/template-polyglot (2026-07-01) — Tier-3 exemplar, not live code
// ORIGIN-FILE: packages/api/typescript/src/ui/controllers/SetStoreVisualization.ts

import { injectable } from 'tsyringe-neo'
import { Controller, HttpStatusCode, z } from '@codedm/core-typescript'
import { AuthAccountMiddleware } from '@auth/middlewares/AuthAccountMiddleware'
import { RequireStoreMember } from '@tenancy/middlewares/RequireStoreMember'
import {
	SetStoreVisualization,
	SetStoreVisualizationInputSchema,
	SetStoreVisualizationOutputSchema,
} from '../usecases/SetStoreVisualization'

export const SetStoreVisualizationControllerInputSchema = z.object({
	ctx: z.object({ session: z.object({ storeId: z.uuid() }) }),
	body: SetStoreVisualizationInputSchema.omit({ storeId: true }),
})

export const SetStoreVisualizationControllerOutputSchema = SetStoreVisualizationOutputSchema

@injectable()
export class SetStoreVisualizationController extends Controller<
	typeof SetStoreVisualizationControllerInputSchema,
	typeof SetStoreVisualizationControllerOutputSchema
> {
	readonly path = '/store-visualization'
	readonly method = 'post' as const
	readonly description = 'Persist the per-store dashboard visualization mode (GLOBAL | NATIONAL)'
	readonly inputSchema = SetStoreVisualizationControllerInputSchema
	readonly outputSchema = SetStoreVisualizationControllerOutputSchema

	override middlewares = [AuthAccountMiddleware, RequireStoreMember]

	constructor(private cmd: SetStoreVisualization) {
		super()
	}

	async handle(request: this['input']): Promise<this['output']> {
		const data = await this.cmd.execute({
			storeId: request.ctx.session.storeId,
			dashboardMode: request.body.dashboardMode,
		})
		return { status: HttpStatusCode.OK, data }
	}
}
