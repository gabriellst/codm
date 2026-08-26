import { injectable } from 'tsyringe-neo'
import { Controller, HttpStatusCode, z } from '@codm/core-typescript'
import { McpScope, OnboardingStep, ContactKind, ProviderKind } from '@codm/contracts-typescript/wire/enums'
import { CloudSessionMiddleware } from '@shared/middlewares'
import { SaveOnboardingStep, SaveOnboardingStepInputSchema } from '../usecases/SaveOnboardingStep'

export const SaveOnboardingStepControllerInputSchema = z
	.object({
		ctx: z.object({ ownerId: z.uuid() }),
		// ownerId vem do ctx — fora da superfície HTTP.
		body: SaveOnboardingStepInputSchema.omit({ ownerId: true }),
	})
	.example([
		{ ctx: { ownerId: '00000000-0000-4000-8000-000000000001' }, body: { currentStep: OnboardingStep.CHANNEL } },
		{
			ctx: { ownerId: '00000000-0000-4000-8000-000000000001' },
			body: {
				currentStep: OnboardingStep.REVIEW,
				state: {
					contactRef: {
						channelId: '019e4d24-6524-7041-9e1c-8108180cddae',
						externalId: '5511999999999@s.whatsapp.net',
						displayName: 'Ada',
						kind: ContactKind.USER,
					},
					workspace: { path: '/Users/dev/acme-api' },
					providers: [ProviderKind.CLAUDE_CODE],
				},
			},
		},
	])
export const SaveOnboardingStepControllerOutputSchema = z.void()

@injectable()
export class SaveOnboardingStepController extends Controller<
	typeof SaveOnboardingStepControllerInputSchema,
	typeof SaveOnboardingStepControllerOutputSchema
> {
	/** Reachable as an MCP tool under this surface — see `agent/mcp/exposure.ts`. */
	static override readonly mcpScopes = [McpScope.system, McpScope.orchestration]
	readonly path = '/ui/onboarding/step'
	readonly method = 'patch' as const
	readonly description = 'Salva onde o operador parou no wizard e/ou o rascunho (contactRef/workspace/providers) acumulado até aqui'
	readonly inputSchema = SaveOnboardingStepControllerInputSchema
	readonly outputSchema = SaveOnboardingStepControllerOutputSchema

	/** SEM `OnboardingMiddleware`: o wizard escreve isto ENQUANTO o onboarding não está concluído. */
	override middlewares = [CloudSessionMiddleware]

	constructor(private saveOnboardingStep: SaveOnboardingStep) {
		super()
	}

	async handle(request: this['input']): Promise<this['output']> {
		await this.saveOnboardingStep.execute({
			ownerId: request.ctx.ownerId,
			currentStep: request.body.currentStep,
			state: request.body.state,
		})
		return { status: HttpStatusCode.NO_CONTENT }
	}
}
