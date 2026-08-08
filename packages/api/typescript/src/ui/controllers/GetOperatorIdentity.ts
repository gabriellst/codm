import { injectable } from 'tsyringe-neo'
import { Controller, HttpStatusCode, z } from '@codm/core-typescript'
import { OperatorMiddleware } from '@auth/middlewares'
import { GetOperatorIdentity, GetOperatorIdentityOutputSchema } from '../usecases/GetOperatorIdentity'

export const GetOperatorIdentityControllerInputSchema = z
	.object({ ctx: z.object({ ownerId: z.uuid() }) })
	.example([{ ctx: { ownerId: '00000000-0000-4000-8000-000000000001' } }])

export const GetOperatorIdentityControllerOutputSchema = GetOperatorIdentityOutputSchema

/**
 * The name and face the console puts on the operator — borrowed from the connected channel.
 *
 * The loan, its two expiry conditions and the way out are documented on the use case; read that
 * docblock before changing this endpoint.
 *
 * ### Not a tool
 * No `static mcpScopes` — the default, and the default means not exposed. An agent already runs AS
 * the operator and has the ownerId; how the human's name renders in a header is not a fact any model
 * needs.
 */
@injectable()
export class GetOperatorIdentityController extends Controller<
	typeof GetOperatorIdentityControllerInputSchema,
	typeof GetOperatorIdentityControllerOutputSchema
> {
	readonly path = '/ui/operator'
	readonly method = 'get' as const
	readonly description = "The operator's displayed identity — name and photo borrowed from the connected channel's own account"
	readonly inputSchema = GetOperatorIdentityControllerInputSchema
	readonly outputSchema = GetOperatorIdentityControllerOutputSchema

	override middlewares = [OperatorMiddleware]

	constructor(private query: GetOperatorIdentity) {
		super()
	}

	async handle(request: this['input']): Promise<this['output']> {
		const data = await this.query.execute({ ownerId: request.ctx.ownerId })
		return { status: HttpStatusCode.OK, data }
	}
}
