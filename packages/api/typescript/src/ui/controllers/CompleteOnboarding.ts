import { injectable } from 'tsyringe-neo'
import { Controller, HttpStatusCode, z } from '@codm/core-typescript'
import { McpScope } from '@codm/contracts-typescript/wire/enums'
import { CloudSessionMiddleware } from '@shared/middlewares'
import { CompleteOnboarding, CompleteOnboardingOutputSchema } from '../usecases/CompleteOnboarding'

export const CompleteOnboardingControllerInputSchema = z
	.object({ ctx: z.object({ ownerId: z.uuid() }) })
	.example([{ ctx: { ownerId: '00000000-0000-4000-8000-000000000001' } }])
export const CompleteOnboardingControllerOutputSchema = CompleteOnboardingOutputSchema

@injectable()
export class CompleteOnboardingController extends Controller<
	typeof CompleteOnboardingControllerInputSchema,
	typeof CompleteOnboardingControllerOutputSchema
> {
	/** Reachable as an MCP tool under this surface — see `agent/mcp/exposure.ts`. */
	static override readonly mcpScopes = [McpScope.system, McpScope.orchestration]
	readonly path = '/ui/onboarding/complete'
	readonly method = 'post' as const
	readonly description = 'Conclui o onboarding do operador — commit atômico do rascunho (workspace/thread) seguido de completedAt'
	readonly inputSchema = CompleteOnboardingControllerInputSchema
	readonly outputSchema = CompleteOnboardingControllerOutputSchema

	/** SEM `OnboardingMiddleware`: exigir onboarding concluído para poder concluí-lo seria um laço. */
	override middlewares = [CloudSessionMiddleware]

	constructor(private completeOnboarding: CompleteOnboarding) {
		super()
	}

	async handle(request: this['input']): Promise<this['output']> {
		const data = await this.completeOnboarding.execute({ ownerId: request.ctx.ownerId })
		return { status: HttpStatusCode.OK, data }
	}
}
