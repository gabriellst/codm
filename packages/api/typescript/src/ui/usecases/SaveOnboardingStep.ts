import { injectable } from 'tsyringe-neo'
import { Handler, z } from '@codm/core-typescript'
import type { Transaction } from '@codm/core-typescript'
import { OnboardingStep } from '@codm/contracts-typescript/wire/enums'
import { Onboarding } from '../entities/Onboarding'
import { OnboardingRepository } from '../repositories/OnboardingRepository'
import { OnboardingDraftStateSchema } from '../schemas/OnboardingDraftState'

export const SaveOnboardingStepInputSchema = z.object({
	ownerId: z.uuid(),
	currentStep: z.enum(OnboardingStep).optional(),
	// O rascunho que os passos WORKSPACE/CONTACT/AGENTS acumulam ANTES do commit atômico (spec
	// 2026-08-26). Mesclado, não substituído — ver `Onboarding.setState`.
	state: OnboardingDraftStateSchema.optional(),
})
export const SaveOnboardingStepOutputSchema = z.void()

/**
 * Onde o operador parou, e o RASCUNHO que ele já preencheu — para que fechar o app não o devolva ao
 * primeiro slide, nem apague contato/workspace/providers que ele já escolheu.
 *
 * O servidor guarda o passo que o cliente reporta e não valida transição: a ORDEM dos passos é
 * composta no console (spec Decision 4) e depende das pendências do host, que este lado não vê.
 * Uma tabela de transições aqui rejeitaria saltos legítimos — como pular direto para o último passo
 * quando não há pendência nenhuma.
 *
 * `currentStep` e `state` são INDEPENDENTES: um PATCH pode mandar só um dos dois (ex.: o passo REVIEW
 * só confirma `currentStep`, sem alterar o rascunho já salvo pelos passos anteriores).
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

			if (input.currentStep) onboarding.advanceTo(input.currentStep)
			if (input.state) onboarding.setState(input.state)

			await this.onboardingRepo.save(onboarding, tx)
		})
	}
}
