import { injectable } from 'tsyringe-neo'
import { z, Controller, HttpStatusCode } from '@template/core-typescript'

export const RequestPasswordResetInputSchema = z
	.object({
		body: z.object({
			email: z.email(),
			redirectTo: z.url().optional(),
		}),
	})
	.example([{ body: { email: 'user@example.com', redirectTo: 'http://localhost:5173/reset-password' } }])

export const RequestPasswordResetOutputSchema = z.void()

@injectable()
export class RequestPasswordResetController extends Controller<
	typeof RequestPasswordResetInputSchema,
	typeof RequestPasswordResetOutputSchema
> {
	readonly path = '/req-password-reset'
	readonly method = 'post' as const
	readonly description = 'Request a password reset email (contract surface; handled by better-auth passthrough)'
	readonly inputSchema = RequestPasswordResetInputSchema
	readonly outputSchema = RequestPasswordResetOutputSchema
	override readonly mockController = true

	protected override getMockResponse() {
		return { status: HttpStatusCode.OK, data: undefined }
	}

	async handle(_request: this['input']): Promise<this['output']> {
		return { status: HttpStatusCode.OK, data: undefined }
	}
}
