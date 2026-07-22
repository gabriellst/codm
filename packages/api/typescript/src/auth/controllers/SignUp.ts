import { injectable } from 'tsyringe-neo'
import { z, Controller, HttpStatusCode } from '@template/core-typescript'
import type { InterfaceErrors } from '@auth/errors'

export const SignUpInputSchema = z
	.object({
		body: z.object({
			name: z.string().min(2),
			email: z.email(),
			password: z.string().min(8).max(64),
			confirmPassword: z.string().min(8).max(64),
		}),
	})
	.refine(data => data.body.password === data.body.confirmPassword, {
		error: 'PASSWORDS_DONT_MATCH' as InterfaceErrors,
		path: ['body', 'confirmPassword'],
	})
	.example([
		{
			body: {
				name: 'John Doe',
				email: 'user@example.com',
				password: 'password123',
				confirmPassword: 'password123',
			},
		},
	])

export const SignUpOutputSchema = z.void()

@injectable()
export class SignUpController extends Controller<typeof SignUpInputSchema, typeof SignUpOutputSchema> {
	readonly path = '/sign-up'
	readonly method = 'post' as const
	readonly description = 'Create a new user account (contract surface; handled by better-auth passthrough)'
	readonly inputSchema = SignUpInputSchema
	readonly outputSchema = SignUpOutputSchema
	override readonly mockController = true

	protected override getMockResponse() {
		return { status: HttpStatusCode.OK, data: undefined }
	}

	async handle(_request: this['input']): Promise<this['output']> {
		return { status: HttpStatusCode.OK, data: undefined }
	}
}
