// packages/api/typescript/src/ui/entities/Onboarding.ts — arquivo final COMPLETO.
// MANTENHA a forma do scaffold: `static override schema`, a interface com declaration merging no fim.
import { AggregateRoot, z } from '@codm/core-typescript'
import Z from 'zod'
import { OnboardingStep } from '@codm/contracts-typescript/wire/enums'

/**
 * A JORNADA do operador pelo wizard — e SÓ ela.
 *
 * Duas coisas moram aqui porque só o servidor pode respondê-las: onde a pessoa parou
 * (`currentStep`) e se ela terminou (`completedAt`). Tudo o mais que o wizard mostra é derivado a
 * cada leitura: a satisfação dos passos de setup sai de consultas de existência no banco (um canal
 * apagado desfaz o passo — spec AC-9), e as pré-condições do sistema saem do host e NUNCA chegam
 * até aqui, porque o servidor não enxerga o TCC da máquina e o mesmo `ownerId` em dois Macs daria
 * respostas diferentes (spec Decision 8).
 *
 * SEM campo `state`: nenhum passo coleta dado que não tenha tabela própria, e um saco genérico seria
 * convite a preenchê-lo com o que não devia (spec Decision 6).
 */
export const OnboardingSchema = z.object({
	ownerId: z.uuid(),
	currentStep: z.enum(OnboardingStep),
	completedAt: z.instanceof(Date).optional(),
})

export type OnboardingProps = Z.infer<typeof OnboardingSchema>

export class Onboarding extends AggregateRoot<typeof OnboardingSchema> {
	static override schema = OnboardingSchema

	static create(data: { ownerId: string }): Onboarding {
		return new Onboarding({
			ownerId: data.ownerId,
			currentStep: OnboardingStep.VALUE,
			completedAt: undefined,
		})
	}

	isCompleted(): boolean {
		return !!this.completedAt
	}

	/**
	 * O cliente reporta onde está; o servidor guarda. Não há tabela de transições válidas: a ORDEM
	 * dos passos é decidida pela composição no console (spec Decision 4), que conhece as pendências
	 * do host — coisa que este lado não conhece. Validar transição aqui seria o servidor opinando
	 * sobre uma lista que ele não vê inteira.
	 */
	advanceTo(step: OnboardingStep): void {
		this.currentStep = step
		this.validate()
	}

	/**
	 * Idempotente de propósito: concluir de novo não remarca a data. Quem chama é um botão, e um
	 * duplo clique não deve reescrever quando o operador terminou.
	 */
	complete(): void {
		if (this.isCompleted()) return
		this.completedAt = new Date()
		this.currentStep = OnboardingStep.FINAL
		this.validate()
	}
}

export interface Onboarding extends OnboardingProps {}
