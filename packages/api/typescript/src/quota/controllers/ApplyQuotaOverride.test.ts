import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'bun:test'
import { container, type DependencyContainer } from 'tsyringe-neo'
import { TestBed, testId } from '@test/support'
import { Config } from '@template/core-typescript'
import { ApplyQuotaOverrideController } from './ApplyQuotaOverride'
import { QuotaOverrideRepository } from '@quota/repositories'
import { QuotaKey } from '@template/contracts-typescript/wire/enums'

// `Config` is declared `as const`, so its fields are `readonly` at the type level even though the
// underlying object is a plain mutable object at runtime — cast to mutate deterministically in tests.
const env = Config.env as { OPERATOR_API_KEY: string }

describe('ApplyQuotaOverrideController', () => {
	let testBed: TestBed
	let testContainer: DependencyContainer
	let controller: ApplyQuotaOverrideController
	let overrideRepository: QuotaOverrideRepository

	const OWNER = testId('quota-ctrl-owner')
	const OPERATOR_KEY = 'operator-secret'
	let originalOperatorKey: string

	// The framework's input envelope only populates body/query/params/ctx; the operator key is read
	// off the RAW request, so the stub carries it on `raw.headers`.
	const request = (body: Record<string, unknown>, operatorKey?: string) =>
		({
			body,
			raw: new Request('https://api.example.com/quota/overrides', {
				method: 'POST',
				headers: operatorKey !== undefined ? { 'x-operator-key': operatorKey } : {},
			}),
			// biome-ignore lint/suspicious/noExplicitAny: test stub — bypasses schema validation.
		}) as any

	beforeAll(async () => {
		testContainer = container.createChildContainer()
		testBed = await TestBed.create('integration', { testContainer, ownerId: OWNER })
		controller = testBed.resolve(ApplyQuotaOverrideController)
		overrideRepository = testBed.resolve(QuotaOverrideRepository)
		originalOperatorKey = Config.env.OPERATOR_API_KEY
	})

	beforeEach(async () => {
		await testBed.reset()
		env.OPERATOR_API_KEY = OPERATOR_KEY
	})

	afterAll(async () => {
		env.OPERATOR_API_KEY = originalOperatorKey
		await testBed.destroy()
	})

	it('rejects with UNAUTHORIZED when the X-Operator-Key header is absent, even for a self-grant (ownerId === session actor)', async () => {
		await expect(
			controller.handle(request({ ownerId: OWNER, meter: QuotaKey.EXAMPLE_KEY, delta: 999999, idempotencyKey: 'k1' })),
		).rejects.toMatchObject({ name: 'UNAUTHORIZED' })

		expect(await overrideRepository.currentDelta(OWNER, QuotaKey.EXAMPLE_KEY)).toBe(0)
	})

	it('rejects with UNAUTHORIZED when the X-Operator-Key header is wrong', async () => {
		await expect(
			controller.handle(request({ ownerId: OWNER, meter: QuotaKey.EXAMPLE_KEY, delta: 1000, idempotencyKey: 'k2' }, 'wrong-key')),
		).rejects.toMatchObject({ name: 'UNAUTHORIZED' })

		expect(await overrideRepository.currentDelta(OWNER, QuotaKey.EXAMPLE_KEY)).toBe(0)
	})

	it('rejects with UNAUTHORIZED when OPERATOR_API_KEY is not configured (fails closed)', async () => {
		env.OPERATOR_API_KEY = ''

		await expect(
			controller.handle(request({ ownerId: OWNER, meter: QuotaKey.EXAMPLE_KEY, delta: 1000, idempotencyKey: 'k3' }, OPERATOR_KEY)),
		).rejects.toMatchObject({ name: 'UNAUTHORIZED' })
	})

	it('calls the usecase when the X-Operator-Key header matches', async () => {
		await controller.handle(request({ ownerId: OWNER, meter: QuotaKey.EXAMPLE_KEY, delta: 500, idempotencyKey: 'k4' }, OPERATOR_KEY))

		expect(await overrideRepository.currentDelta(OWNER, QuotaKey.EXAMPLE_KEY)).toBe(500)
	})
})
