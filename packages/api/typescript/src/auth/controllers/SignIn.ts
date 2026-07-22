import { injectable } from 'tsyringe-neo'
import { z, Controller, HttpStatusCode } from '@template/core-typescript'

export const SignInInputSchema = z
	.object({
		body: z.object({
			email: z.email(),
			password: z.string().min(8).max(64),
		}),
	})
	.example([{ body: { email: 'user@example.com', password: 'password123' } }])

export const SignInOutputSchema = z.void()

@injectable()
export class SignInController extends Controller<typeof SignInInputSchema, typeof SignInOutputSchema> {
	readonly path = '/sign-in'
	readonly method = 'post' as const
	readonly description = 'Sign in with email and password (contract surface; handled by better-auth passthrough)'
	readonly inputSchema = SignInInputSchema
	readonly outputSchema = SignInOutputSchema
	override readonly mockController = true

	protected override getMockResponse() {
		return { status: HttpStatusCode.OK, data: undefined }
	}

	async handle(_request: this['input']): Promise<this['output']> {
		return { status: HttpStatusCode.OK, data: undefined }
	}
}
