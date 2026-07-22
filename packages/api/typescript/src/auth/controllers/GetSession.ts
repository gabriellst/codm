// Recipe: dev:packages/api/src/auth/controllers pattern.
// Returns current session user + session info. Does not require AuthActorMiddleware
// (session may not have an actor set yet — this is the session lookup endpoint itself).
import { injectable } from 'tsyringe-neo'
import { Middleware, MiddlewareClass, z } from '@template/core-typescript'
import { Controller } from '@template/core-typescript'
import { HttpStatusCode } from '@template/core-typescript'
import { SessionSchema } from '@auth/schemas'
import { AuthAccountMiddleware } from '@auth/middlewares'

export const GetSessionInputSchema = z
	.object({
		ctx: SessionSchema,
	})
	.example([
		{
			ctx: {
				user: { id: 'user-1', email: 'user@example.com', name: 'Alice', emailVerified: true },
				session: { id: 'session-1', userId: 'user-1', expiresAt: new Date('2030-01-01T00:00:00.000Z'), ownerId: null },
			},
		},
	])

export const GetSessionOutputSchema = SessionSchema.example([
	{
		user: { id: 'user-1', email: 'user@example.com', name: 'Alice', emailVerified: true },
		session: { id: 'session-1', userId: 'user-1', expiresAt: new Date('2030-01-01T00:00:00.000Z'), ownerId: null },
	},
])

@injectable()
export class GetSessionController extends Controller<typeof GetSessionInputSchema, typeof GetSessionOutputSchema> {
	readonly path = '/session'
	readonly method = 'get' as const
	readonly description = 'Get current authenticated session'
	readonly inputSchema = GetSessionInputSchema
	readonly outputSchema = GetSessionOutputSchema

	override middlewares: (Middleware | MiddlewareClass)[] = [AuthAccountMiddleware]

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
