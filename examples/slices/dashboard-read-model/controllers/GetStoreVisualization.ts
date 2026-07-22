// CONTEXT-ORIGIN: template@feat/template-polyglot (2026-07-01) — Tier-3 exemplar, not live code
// ORIGIN-FILE: packages/api/typescript/src/ui/controllers/GetStoreVisualization.ts

import { injectable } from 'tsyringe-neo'
import { Controller, HttpStatusCode, z } from '@template/core-typescript'
import { AuthAccountMiddleware } from '@auth/middlewares/AuthAccountMiddleware'
import { RequireStoreMember } from '@tenancy/middlewares/RequireStoreMember'
import { GetStoreVisualization, GetStoreVisualizationOutputSchema } from '../usecases/GetStoreVisualization'

export const GetStoreVisualizationControllerInputSchema = z.object({
	ctx: z.object({ session: z.object({ storeId: z.uuid() }) }),
})

export const GetStoreVisualizationControllerOutputSchema = GetStoreVisualizationOutputSchema

@injectable()
export class GetStoreVisualizationController extends Controller<
	typeof GetStoreVisualizationControllerInputSchema,
	typeof GetStoreVisualizationControllerOutputSchema
> {
	readonly path = '/store-visualization'
	readonly method = 'get' as const
	readonly description = 'The persisted dashboard visualization mode for the session store'
	readonly inputSchema = GetStoreVisualizationControllerInputSchema
	readonly outputSchema = GetStoreVisualizationControllerOutputSchema

	override middlewares = [AuthAccountMiddleware, RequireStoreMember]

	constructor(private query: GetStoreVisualization) {
		super()
	}

	async handle(request: this['input']): Promise<this['output']> {
		const data = await this.query.execute({ storeId: request.ctx.session.storeId })
		return { status: HttpStatusCode.OK, data }
	}
}
