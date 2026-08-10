import { injectable } from 'tsyringe-neo'
import { Handler, z } from '@codm/core-typescript'
import type { Transaction } from '@codm/core-typescript'
import { OnboardingStep } from '@codm/contracts-typescript/wire/enums'
import { Onboarding } from '../entities/Onboarding'
import { OnboardingRepository } from '../repositories/OnboardingRepository'

export const SaveOnboardingStepInputSchema = z.object({
	ownerId: z.uuid(),
	step: z.enum(OnboardingStep),
})
export const SaveOnboardingStepOutputSchema = z.void()

/**
 * Onde o operador parou, para que fechar o app não o devolva ao primeiro slide.
 *
 * O servidor guarda o passo que o cliente reporta e não valida transição: a ORDEM dos passos é
 * composta no console (spec Decision 4) e depende das pendências do host, que este lado não vê.
 * Uma tabela de transições aqui rejeitaria saltos legítimos — como pular direto para o último passo
 * quando não há pendência nenhuma.
 */
@injectable()
export class SaveOnboardingStep extends Handler<typeof SaveOnboardingStepInputSchema, typeof SaveOnboardingStepOutputSchema> {
	readonly name = 'save_onboarding_step' as const
	readonly inputSchema = SaveOnboardingStepInputSchema
	readonly outputSchema = SaveOnboardingStepOutputSchema

	constructor(private readonly onboardingRepo: OnboardingRepository) {
		super()
	}

	protected async handle(input: this['input'], tx?: Transaction): Promise<this['output']> {
		return this.withTransaction(tx, async tx => {
			const onboarding = (await this.onboardingRepo.findByOwnerId(input.ownerId, tx)) ?? Onboarding.create({ ownerId: input.ownerId })

			onboarding.advanceTo(input.step)

			await this.onboardingRepo.save(onboarding, tx)
		})
	}
}
