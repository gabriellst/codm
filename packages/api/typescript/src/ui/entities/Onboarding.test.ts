import { describe, expect, it } from 'bun:test'
import { ContactKind, OnboardingStep, ProviderKind } from '@codm/contracts-typescript/wire/enums'
import { Onboarding } from './Onboarding'

/**
 * O AGREGADO GUARDA A JORNADA (+ o rascunho), não o mundo. `currentStep`/`completedAt`/`state` são
 * as únicas coisas que o servidor sabe sobre o onboarding — a satisfação dos passos de setup é
 * derivada do banco a cada leitura (spec Decision 8), e uma SystemPrecondition nunca chega aqui.
 */
describe('Onboarding', () => {
	it('nasce no primeiro passo, sem rascunho e não concluído', () => {
		const onboarding = Onboarding.create({ ownerId: '019e4d24-6524-7041-9e1c-8108180cddae' })

		expect(onboarding.currentStep).toBe(OnboardingStep.VALUE)
		expect(onboarding.state).toEqual({})
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

	/**
	 * `setState` acumula os grupos que os passos WORKSPACE/CONTACT/AGENTS mandam — cada PATCH pode
	 * trazer só um deles, e os anteriores sobrevivem.
	 */
	it('acumula o rascunho por grupo — providers de um PATCH não apaga o workspace de outro', () => {
		const onboarding = Onboarding.create({ ownerId: '019e4d24-6524-7041-9e1c-8108180cddae' })

		onboarding.setState({ workspace: { path: '/Users/dev/acme-api' } })
		onboarding.setState({ providers: [ProviderKind.CLAUDE_CODE] })

		expect(onboarding.state).toEqual({
			workspace: { path: '/Users/dev/acme-api' },
			providers: [ProviderKind.CLAUDE_CODE],
		})
	})

	/**
	 * O merge é RASO por decisão (docblock de `setState`): mandar `workspace` de novo SUBSTITUI o
	 * grupo inteiro, não funde campo a campo dentro dele.
	 */
	it('o merge de um grupo é raso — reenviar workspace substitui o grupo inteiro', () => {
		const onboarding = Onboarding.create({ ownerId: '019e4d24-6524-7041-9e1c-8108180cddae' })

		onboarding.setState({ workspace: { path: '/Users/dev/acme-api', existingWorkspaceId: '019e4d24-6524-7041-9e1c-8108180cddb0' } })
		onboarding.setState({ workspace: { path: '/Users/dev/other-repo' } })

		expect(onboarding.state.workspace).toEqual({ path: '/Users/dev/other-repo' })
	})

	it('complete() carrega o rascunho já acumulado — completar não apaga o que foi salvo', () => {
		const onboarding = Onboarding.create({ ownerId: '019e4d24-6524-7041-9e1c-8108180cddae' })
		onboarding.setState({
			contactRef: { channelId: '019e4d24-6524-7041-9e1c-8108180cddae', externalId: 'x', displayName: 'Ada', kind: ContactKind.USER },
		})

		onboarding.complete()

		expect(onboarding.state.contactRef?.displayName).toBe('Ada')
	})
})
