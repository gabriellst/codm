import { injectable } from 'tsyringe-neo'
import { Controller, HttpStatusCode, z } from '@codm/core-typescript'
import { McpScope } from '@codm/contracts-typescript/wire/enums'
import { OperatorMiddleware } from '@auth/middlewares'
import { GetOnboarding, GetOnboardingOutputSchema } from '../usecases/GetOnboarding'

export const GetOnboardingControllerInputSchema = z
	.object({ ctx: z.object({ ownerId: z.uuid() }) })
	.example([{ ctx: { ownerId: '00000000-0000-4000-8000-000000000001' } }])
export const GetOnboardingControllerOutputSchema = GetOnboardingOutputSchema

@injectable()
export class GetOnboardingController extends Controller<
	typeof GetOnboardingControllerInputSchema,
	typeof GetOnboardingControllerOutputSchema
> {
	/** Reachable as an MCP tool under this surface — see `agent/mcp/exposure.ts`. */
	static override readonly mcpScopes = [McpScope.system]
	readonly path = '/ui/onboarding'
	readonly method = 'get' as const
	readonly description = 'Onboarding — jornada persistida (currentStep/completedAt) + satisfação derivada dos passos de setup'
	readonly inputSchema = GetOnboardingControllerInputSchema
	readonly outputSchema = GetOnboardingControllerOutputSchema

	/**
	 * SEM `OnboardingMiddleware` — de propósito, e é a metade da spec Decision 10 que impede o beco
	 * sem saída: é justamente esta leitura que o wizard faz enquanto o onboarding NÃO está concluído.
	 * Barrá-la seria exigir a conclusão para poder descobrir o que falta concluir.
	 */
	override middlewares = [OperatorMiddleware]

	constructor(private query: GetOnboarding) {
		super()
	}

	async handle(request: this['input']): Promise<this['output']> {
		const data = await this.query.execute({ ownerId: request.ctx.ownerId })
		return { status: HttpStatusCode.OK, data }
	}
}
