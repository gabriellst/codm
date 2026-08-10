import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'bun:test'
import { container, type DependencyContainer } from 'tsyringe-neo'
import { OnboardingStep } from '@codm/contracts-typescript/wire/enums'
import { TestBed } from '@test/support'
import { Onboarding } from '../../entities/Onboarding'
import { OnboardingRepository } from './OnboardingRepository'

const OWNER = '019e4d24-6524-7041-9e1c-8108180cddae'
const OTHER_OWNER = '019e4d24-6524-7041-9e1c-8108180cddaf'

describe('DrizzleOnboardingRepository', () => {
	let testBed: TestBed
	let testContainer: DependencyContainer
	let repo: OnboardingRepository

	beforeAll(async () => {
		testContainer = container.createChildContainer()
		testBed = await TestBed.create('integration', { testContainer, ownerId: OWNER })
		repo = testBed.resolve(OnboardingRepository)
	})
	beforeEach(async () => {
		await testBed.reset()
	})
	afterAll(async () => {
		await testBed.destroy()
	})

	it('salva e reidrata o progresso pelo ownerId', async () => {
		const onboarding = Onboarding.create({ ownerId: OWNER })
		onboarding.advanceTo(OnboardingStep.CHANNEL)
		await repo.save(onboarding)

		const found = await repo.findByOwnerId(OWNER)

		expect(found).toBeDefined()
		expect(found?.currentStep).toBe(OnboardingStep.CHANNEL)
		expect(found?.completedAt).toBeUndefined()
	})

	it('a conclusão sobrevive à reidratação', async () => {
		const onboarding = Onboarding.create({ ownerId: OWNER })
		onboarding.complete()
		await repo.save(onboarding)

		const found = await repo.findByOwnerId(OWNER)

		expect(found?.isCompleted()).toBe(true)
		expect(found?.currentStep).toBe(OnboardingStep.FINAL)
	})

	/**
	 * AC-3 — o progresso é por operador. Este é o caso que o app real nunca exercita (há um único
	 * OPERATOR_ID), e é exatamente por isso que ele existe aqui: a garantia é do repositório, não da
	 * sessão.
	 */
	it('AC-3: um segundo operador tem onboarding independente', async () => {
		const mine = Onboarding.create({ ownerId: OWNER })
		mine.complete()
		await repo.save(mine)

		const theirs = Onboarding.create({ ownerId: OTHER_OWNER })
		await repo.save(theirs)

		expect((await repo.findByOwnerId(OWNER))?.isCompleted()).toBe(true)
		expect((await repo.findByOwnerId(OTHER_OWNER))?.isCompleted()).toBe(false)
	})

	it('devolve undefined para um dono que nunca começou', async () => {
		expect(await repo.findByOwnerId(OTHER_OWNER)).toBeUndefined()
	})
})
