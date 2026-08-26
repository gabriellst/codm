// Session endpoint. A casca é fina de propósito — quem valida é o MIDDLEWARE, e é ele que mudou.
//
// O comentário anterior descrevia um mundo que o ADR 0001 encerrou: *"there is no session store and
// no better-auth lookup — AuthAccountMiddleware stamps the constant operator identity onto ctx"*.
// Essa constante morreu com o colapso do operador, mas o middleware ficou — e passou a ler o cache
// em DISCO do desktop numa rota que monta SÓ NA NUVEM, onde esse cache nunca existe. Ver o docblock
// do `AuthAccountMiddleware` para o defeito inteiro; em uma linha: esta porta ignorava o
// `Authorization` que o daemon local lhe apresentava, e por isso nunca respondia a ele.
import { injectable } from 'tsyringe-neo'
import { Middleware, MiddlewareClass, z } from '@codm/core-typescript'
import { Controller } from '@codm/core-typescript'
import { HttpStatusCode } from '@codm/core-typescript'
import { SessionSchema } from '@shared/schemas'
import { AuthAccountMiddleware } from '../middlewares'

export const GetSessionInputSchema = z
	.object({
		ctx: SessionSchema,
	})
	.example([
		{
			ctx: {
				user: { id: '019e4d24-6524-7041-9e1c-8108180cddae', email: 'user@example.com', name: 'Alice', emailVerified: true },
				session: {
					id: '019e4d24-6524-7041-9e1c-8108180cddaf',
					userId: '019e4d24-6524-7041-9e1c-8108180cddae',
					expiresAt: new Date('2030-01-01T00:00:00.000Z'),
					ownerId: null,
				},
			},
		},
	])

export const GetSessionOutputSchema = SessionSchema.example([
	{
		user: { id: '019e4d24-6524-7041-9e1c-8108180cddae', email: 'user@example.com', name: 'Alice', emailVerified: true },
		session: {
			id: '019e4d24-6524-7041-9e1c-8108180cddaf',
			userId: '019e4d24-6524-7041-9e1c-8108180cddae',
			expiresAt: new Date('2030-01-01T00:00:00.000Z'),
			ownerId: null,
		},
	},
])

@injectable()
export class GetSessionController extends Controller<typeof GetSessionInputSchema, typeof GetSessionOutputSchema> {
	readonly path = '/session'
	readonly method = 'get' as const
	readonly description = 'Get the current authenticated session'
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
