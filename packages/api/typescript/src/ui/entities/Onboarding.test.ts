import { describe, expect, it } from 'bun:test'
import { OnboardingStep } from '@codm/contracts-typescript/wire/enums'
import { Onboarding } from './Onboarding'

/**
 * O AGREGADO GUARDA A JORNADA, não o mundo. `currentStep` e `completedAt` são as duas únicas coisas
 * que o servidor sabe sobre o onboarding — a satisfação dos passos de setup é derivada do banco a
 * cada leitura (spec Decision 8), e uma SystemPrecondition nunca chega aqui.
 */
describe('Onboarding', () => {
	it('nasce no primeiro passo e não concluído', () => {
		const onboarding = Onboarding.create({ ownerId: '019e4d24-6524-7041-9e1c-8108180cddae' })

		expect(onboarding.currentStep).toBe(OnboardingStep.VALUE)
		expect(onboarding.completedAt).toBeUndefined()
		expect(onboarding.isCompleted()).toBe(false)
	})

	it('avança para o passo que o cliente reporta', () => {
		const onboarding = Onboarding.create({ ownerId: '019e4d24-6524-7041-9e1c-8108180cddae' })

		onboarding.advanceTo(OnboardingStep.CHANNEL)

		expect(onboarding.currentStep).toBe(OnboardingStep.CHANNEL)
	})

	/**
	 * AC-2. `complete()` é o ÚNICO caminho para `completedAt`, e ele não pergunta nada sobre passos de
	 * setup: a spec (Decision 13) manda bloquear a conclusão apenas por passo REQUIRED, e nenhum passo
	 * de hoje é REQUIRED — logo, do lado do servidor, concluir é sempre possível.
	 */
	it('concluir grava completedAt e leva ao passo final', () => {
		const onboarding = Onboarding.create({ ownerId: '019e4d24-6524-7041-9e1c-8108180cddae' })

		onboarding.complete()

		expect(onboarding.isCompleted()).toBe(true)
		expect(onboarding.completedAt).toBeInstanceOf(Date)
		expect(onboarding.currentStep).toBe(OnboardingStep.FINAL)
	})

	/** Concluir duas vezes não move a data — a segunda chamada é inerte, não um erro. */
	it('concluir de novo preserva a data da primeira conclusão', () => {
		const onboarding = Onboarding.create({ ownerId: '019e4d24-6524-7041-9e1c-8108180cddae' })
		onboarding.complete()
		const first = onboarding.completedAt

		onboarding.complete()

		expect(onboarding.completedAt).toEqual(first)
	})
})
