import { injectable } from 'tsyringe-neo'
import { Handler, z } from '@codm/core-typescript'
import type { Transaction } from '@codm/core-typescript'
import { Onboarding } from '../entities/Onboarding'
import { OnboardingRepository } from '../repositories/OnboardingRepository'

export const CompleteOnboardingInputSchema = z.object({ ownerId: z.uuid() })
export const CompleteOnboardingOutputSchema = z.void()

/**
 * O fim do wizard. Grava `completedAt`, que é o ÚNICO fato que destranca a API (spec Decision 10).
 *
 * NÃO verifica passo nenhum antes de concluir, e isso é a decisão e não um esquecimento: a spec
 * bloqueia a conclusão apenas por passo `REQUIRED` (Decision 13), nenhum passo de hoje é `REQUIRED`,
 * e a lista de passos que o operador vê é composta no console — que conhece as pendências do host,
 * coisa que este lado nunca conhece. Um servidor validando essa lista estaria opinando sobre o que
 * não enxerga.
 *
 * Cria a linha se ela não existir: quem clica em concluir pode nunca ter salvo passo nenhum.
 */
@injectable()
export class CompleteOnboarding extends Handler<typeof CompleteOnboardingInputSchema, typeof CompleteOnboardingOutputSchema> {
	readonly name = 'complete_onboarding' as const
	readonly inputSchema = CompleteOnboardingInputSchema
	readonly outputSchema = CompleteOnboardingOutputSchema

	constructor(private readonly onboardingRepo: OnboardingRepository) {
		super()
	}

	protected async handle(input: this['input'], tx?: Transaction): Promise<this['output']> {
		return this.withTransaction(tx, async tx => {
			const onboarding = (await this.onboardingRepo.findByOwnerId(input.ownerId, tx)) ?? Onboarding.create({ ownerId: input.ownerId })

			onboarding.complete()

			await this.onboardingRepo.save(onboarding, tx)
		})
	}
}
