// Session endpoint. After the operator collapse there is no session store and no better-auth
// lookup — OperatorMiddleware stamps the constant operator identity onto ctx, and this controller
// simply echoes it. Kept so the frontend session seam (SDK `useGetSession`) still resolves, though
// the web/native session hooks short-circuit to the same constant without a round-trip.
import { injectable } from 'tsyringe-neo'
import { Middleware, MiddlewareClass, z } from '@template/core-typescript'
import { Controller } from '@template/core-typescript'
import { HttpStatusCode } from '@template/core-typescript'
import { SessionSchema } from '@auth/schemas'
import { OperatorMiddleware } from '@auth/middlewares'

export const GetSessionInputSchema = z
	.object({
		ctx: SessionSchema,
	})
	.example([
		{
			ctx: {
				user: { id: 'operator', email: 'operator@codedm.local', name: 'Operator', emailVerified: true },
				session: { id: 'operator', userId: 'operator', expiresAt: new Date('2999-12-31T00:00:00.000Z'), ownerId: 'operator' },
			},
		},
	])

export const GetSessionOutputSchema = SessionSchema.example([
	{
		user: { id: 'operator', email: 'operator@codedm.local', name: 'Operator', emailVerified: true },
		session: { id: 'operator', userId: 'operator', expiresAt: new Date('2999-12-31T00:00:00.000Z'), ownerId: 'operator' },
	},
])

@injectable()
export class GetSessionController extends Controller<typeof GetSessionInputSchema, typeof GetSessionOutputSchema> {
	readonly path = '/session'
	readonly method = 'get' as const
	readonly description = 'Get the current operator session'
	readonly inputSchema = GetSessionInputSchema
	readonly outputSchema = GetSessionOutputSchema

	override middlewares: (Middleware | MiddlewareClass)[] = [OperatorMiddleware]

	async handle(request: this['input']): Promise<this['output']> {
		const { ctx } = request
		return {
			status: HttpStatusCode.OK,
			data: {
				...ctx,
			},
		}
	}
}
