import { injectable } from 'tsyringe-neo'
import { Controller, HttpStatusCode, z } from '@codm/core-typescript'
import { McpScope } from '@codm/contracts-typescript/wire/enums'
import { OperatorMiddleware } from '@auth/middlewares'
import { CompleteOnboarding } from '../usecases/CompleteOnboarding'

export const CompleteOnboardingControllerInputSchema = z
	.object({ ctx: z.object({ ownerId: z.uuid() }) })
	.example([{ ctx: { ownerId: '00000000-0000-4000-8000-000000000001' } }])
export const CompleteOnboardingControllerOutputSchema = z.void()

@injectable()
export class CompleteOnboardingController extends Controller<
	typeof CompleteOnboardingControllerInputSchema,
	typeof CompleteOnboardingControllerOutputSchema
> {
	/** Reachable as an MCP tool under this surface — see `agent/mcp/exposure.ts`. */
	static override readonly mcpScopes = [McpScope.system]
	readonly path = '/ui/onboarding/complete'
	readonly method = 'post' as const
	readonly description = 'Conclui o onboarding do operador — grava completedAt'
	readonly inputSchema = CompleteOnboardingControllerInputSchema
	readonly outputSchema = CompleteOnboardingControllerOutputSchema

	/** SEM `OnboardingMiddleware`: exigir onboarding concluído para poder concluí-lo seria um laço. */
	override middlewares = [OperatorMiddleware]

	constructor(private completeOnboarding: CompleteOnboarding) {
		super()
	}

	async handle(request: this['input']): Promise<this['output']> {
		await this.completeOnboarding.execute({ ownerId: request.ctx.ownerId })
		return { status: HttpStatusCode.NO_CONTENT }
	}
}
