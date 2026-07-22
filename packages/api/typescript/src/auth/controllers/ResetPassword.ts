import { injectable } from 'tsyringe-neo'
import { z, Controller, HttpStatusCode } from '@template/core-typescript'
import type { InterfaceErrors } from '@auth/errors'

export const ResetPasswordInputSchema = z
	.object({
		body: z.object({
			token: z.string().min(1),
			newPassword: z.string().min(8).max(64),
			confirmNewPassword: z.string().min(8).max(64),
		}),
	})
	.refine(data => data.body.newPassword === data.body.confirmNewPassword, {
		error: 'PASSWORDS_DONT_MATCH' as InterfaceErrors,
		path: ['body', 'confirmNewPassword'],
	})
	.example([{ body: { token: 'reset-token-123', newPassword: 'newpassword123', confirmNewPassword: 'newpassword123' } }])

export const ResetPasswordOutputSchema = z.void()

@injectable()
export class ResetPasswordController extends Controller<typeof ResetPasswordInputSchema, typeof ResetPasswordOutputSchema> {
	readonly path = '/reset-pass'
	readonly method = 'post' as const
	readonly description = 'Reset password with a token (contract surface; handled by better-auth passthrough)'
	readonly inputSchema = ResetPasswordInputSchema
	readonly outputSchema = ResetPasswordOutputSchema
	override readonly mockController = true

	protected override getMockResponse() {
		return { status: HttpStatusCode.OK, data: undefined }
	}

	async handle(_request: this['input']): Promise<this['output']> {
		return { status: HttpStatusCode.OK, data: undefined }
	}
}
