import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'bun:test'
import { container, type DependencyContainer } from 'tsyringe-neo'
import { OnboardingStep } from '@codm/contracts-typescript/wire/enums'
import { TestBed } from '@test/support'
import { OPERATOR_ID } from '@auth/operator'
import { OnboardingRepository } from '../repositories/OnboardingRepository'
import { CompleteOnboarding } from './CompleteOnboarding'
import { SaveOnboardingStep } from './SaveOnboardingStep'

// O plano cita `OWNER = 'integration-tenant'`, mas `ownerId` é `z.uuid()` na Onboarding entity — uma
// string não-UUID quebra `INVALID_ENTITY` ao salvar. Segue o mesmo padrão de GetOnboarding.test.ts:
// `OPERATOR_ID`, que também é o default de todo `given*` helper.
const OWNER = OPERATOR_ID

/**
 * OS DOIS ÚNICOS CAMINHOS DE ESCRITA do onboarding, e ambos criam a linha se ela ainda não existe —
 * é assim que um operador que nunca abriu o wizard passa a ter progresso sem nenhum passo de
 * "inicializar" separado.
 *
 * Nenhum dos dois pergunta nada sobre passos de setup: a spec (Decision 13) bloqueia a conclusão
 * apenas por passo REQUIRED, nenhum passo de hoje é REQUIRED, e a decisão de deixar concluir vive no
 * console. Do lado do servidor, concluir é sempre possível — e a AC-8 é isso.
 */
describe('CompleteOnboarding / SaveOnboardingStep', () => {
	let testBed: TestBed
	let testContainer: DependencyContainer
	let complete: CompleteOnboarding
	let saveStep: SaveOnboardingStep
	let repo: OnboardingRepository

	beforeAll(async () => {
		testContainer = container.createChildContainer()
		testBed = await TestBed.create('integration', { testContainer, ownerId: OWNER })
		complete = testBed.resolve(CompleteOnboarding)
		saveStep = testBed.resolve(SaveOnboardingStep)
		repo = testBed.resolve(OnboardingRepository)
	})
	beforeEach(async () => {
		await testBed.reset()
	})
	afterAll(async () => {
		await testBed.destroy()
	})

	/** AC-2. */
	it('AC-2: concluir grava completedAt para aquele ownerId', async () => {
		await complete.execute({ ownerId: OWNER })

		const saved = await repo.findByOwnerId(OWNER)
		expect(saved?.isCompleted()).toBe(true)
		expect(saved?.currentStep).toBe(OnboardingStep.FINAL)
	})

	/** AC-8 — nenhum passo de setup satisfeito, e concluir mesmo assim funciona. */
	it('AC-8: concluir funciona com todo o setup por fazer', async () => {
		await complete.execute({ ownerId: OWNER })

		expect((await repo.findByOwnerId(OWNER))?.isCompleted()).toBe(true)
	})

	it('salvar o passo cria a linha na primeira vez e a atualiza depois', async () => {
		await saveStep.execute({ ownerId: OWNER, step: OnboardingStep.CHANNEL })
		expect((await repo.findByOwnerId(OWNER))?.currentStep).toBe(OnboardingStep.CHANNEL)

		await saveStep.execute({ ownerId: OWNER, step: OnboardingStep.AGENTS })
		expect((await repo.findByOwnerId(OWNER))?.currentStep).toBe(OnboardingStep.AGENTS)
	})

	it('concluir duas vezes não remarca a data', async () => {
		await complete.execute({ ownerId: OWNER })
		const first = (await repo.findByOwnerId(OWNER))?.completedAt

		await complete.execute({ ownerId: OWNER })

		expect((await repo.findByOwnerId(OWNER))?.completedAt).toEqual(first)
	})
})
