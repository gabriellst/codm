import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'bun:test'
import { container, type DependencyContainer } from 'tsyringe-neo'
import { BaseError } from '@codm/core-typescript'
import { TestBed } from '@test/support'
import { OPERATOR_ID } from '@auth/operator'
import { OnboardingRepository } from '../repositories/OnboardingRepository'
import { Onboarding } from '../entities/Onboarding'
import { OnboardingMiddleware } from './OnboardingMiddleware'

/**
 * O PORTÃO, e o falseador dele: com a implementação desligada estes dois casos não podem passar ao
 * mesmo tempo — um exige recusa, o outro exige passagem, e os dois olham o MESMO estado exceto pelo
 * `completedAt`.
 */
describe('OnboardingMiddleware', () => {
	let testBed: TestBed
	let testContainer: DependencyContainer
	let middleware: OnboardingMiddleware
	let repo: OnboardingRepository

	beforeAll(async () => {
		testContainer = container.createChildContainer()
		testBed = await TestBed.create('integration', { testContainer, ownerId: OPERATOR_ID })
		middleware = testBed.resolve(OnboardingMiddleware)
		repo = testBed.resolve(OnboardingRepository)
	})
	beforeEach(async () => {
		await testBed.reset()
	})
	afterAll(async () => {
		await testBed.destroy()
	})

	/** AC-1 — sem onboarding nenhum. */
	it('AC-1: recusa quando o operador nunca começou', async () => {
		const request = { ctx: { ownerId: OPERATOR_ID } } as never

		expect(middleware.execute(request)).rejects.toThrow(BaseError)
	})

	/** AC-1 — começou mas não concluiu. */
	it('AC-1: recusa quando começou e não concluiu', async () => {
		await repo.save(Onboarding.create({ ownerId: OPERATOR_ID }))
		const request = { ctx: { ownerId: OPERATOR_ID } } as never

		expect(middleware.execute(request)).rejects.toThrow(BaseError)
	})

	/** AC-2 — concluído, passa. */
	it('AC-2: deixa passar depois de concluído', async () => {
		const onboarding = Onboarding.create({ ownerId: OPERATOR_ID })
		onboarding.complete()
		await repo.save(onboarding)
		const request = { ctx: { ownerId: OPERATOR_ID } } as never

		expect(await middleware.execute(request)).toEqual({})
	})
})
