import { injectable } from 'tsyringe-neo'
import { Controller, HttpStatusCode, z } from '@codm/core-typescript'
import { McpScope, OnboardingStep } from '@codm/contracts-typescript/wire/enums'
import { OperatorMiddleware } from '@auth/middlewares'
import { SaveOnboardingStep, SaveOnboardingStepInputSchema } from '../usecases/SaveOnboardingStep'

export const SaveOnboardingStepControllerInputSchema = z
	.object({
		ctx: z.object({ ownerId: z.uuid() }),
		// ownerId vem do ctx — fora da superfície HTTP.
		body: SaveOnboardingStepInputSchema.omit({ ownerId: true }),
	})
	.example([{ ctx: { ownerId: '00000000-0000-4000-8000-000000000001' }, body: { step: OnboardingStep.CHANNEL } }])
export const SaveOnboardingStepControllerOutputSchema = z.void()

@injectable()
export class SaveOnboardingStepController extends Controller<
	typeof SaveOnboardingStepControllerInputSchema,
	typeof SaveOnboardingStepControllerOutputSchema
> {
	/** Reachable as an MCP tool under this surface — see `agent/mcp/exposure.ts`. */
	static override readonly mcpScopes = [McpScope.system]
	readonly path = '/ui/onboarding/step'
	readonly method = 'patch' as const
	readonly description = 'Salva onde o operador parou no wizard'
	readonly inputSchema = SaveOnboardingStepControllerInputSchema
	readonly outputSchema = SaveOnboardingStepControllerOutputSchema

	/** SEM `OnboardingMiddleware`: o wizard escreve isto ENQUANTO o onboarding não está concluído. */
	override middlewares = [OperatorMiddleware]

	constructor(private saveOnboardingStep: SaveOnboardingStep) {
		super()
	}

	async handle(request: this['input']): Promise<this['output']> {
		await this.saveOnboardingStep.execute({ ownerId: request.ctx.ownerId, step: request.body.step })
		return { status: HttpStatusCode.NO_CONTENT }
	}
}
