// DrizzleIdempotencyGuard — the exactly-once claim latch on shared.idempotency_keys, against a real
// SQLite file. Ported from medscall@f04e8a0f
// (packages/api/src/shared/services/IdempotencyGuard/DrizzleIdempotencyGuard.test.ts); scopes swapped
// for the template's generic IdempotencyScope placeholders, plus a release round-trip added since
// release ("always on the pool") is a load-bearing part of the claim-commit-effect contract.
import { TestBed } from '@test/support'
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'bun:test'
import { container, DependencyContainer } from 'tsyringe-neo'
import { IdempotencyGuard } from '@codedm/core-typescript'
import { IdempotencyScope } from '@shared/enums'

describe('DrizzleIdempotencyGuard', () => {
	let testBed: TestBed
	let testContainer: DependencyContainer
	let guard: IdempotencyGuard

	beforeAll(async () => {
		testContainer = container.createChildContainer()
		testBed = await TestBed.create('integration', {
			testContainer,
			ownerId: 'idem-test',
		})
		guard = testBed.resolve(IdempotencyGuard)
	})

	beforeEach(async () => {
		await testBed.reset()
	})

	afterAll(async () => {
		await testBed.destroy()
	})

	it('claims a (scope, key) once: first call true, second false', async () => {
		expect(await guard.claim(IdempotencyScope.WEBHOOK_RECEIVED, 'evt-1')).toBe(true)
		expect(await guard.claim(IdempotencyScope.WEBHOOK_RECEIVED, 'evt-1')).toBe(false)
	})

	it('isolates by scope: same key under a different scope is a fresh claim', async () => {
		expect(await guard.claim(IdempotencyScope.WEBHOOK_RECEIVED, 'evt-1')).toBe(true)
		expect(await guard.claim(IdempotencyScope.COMMAND_EFFECT, 'evt-1')).toBe(true)
	})

	it('is concurrency-safe: two parallel claims of the same key yield exactly one true', async () => {
		const [a, b] = await Promise.all([
			guard.claim(IdempotencyScope.COMMAND_EFFECT, 'cmd-1:1'),
			guard.claim(IdempotencyScope.COMMAND_EFFECT, 'cmd-1:1'),
		])
		expect([a, b].filter(Boolean)).toHaveLength(1)
	})

	it('release un-claims a (scope, key) so a later redelivery can re-claim it', async () => {
		expect(await guard.claim(IdempotencyScope.COMMAND_EFFECT, 'cmd-2:1')).toBe(true)
		await guard.release(IdempotencyScope.COMMAND_EFFECT, 'cmd-2:1')
		expect(await guard.claim(IdempotencyScope.COMMAND_EFFECT, 'cmd-2:1')).toBe(true)
	})

	it('release is a no-op (not an error) when the (scope, key) was never claimed', async () => {
		await expect(guard.release(IdempotencyScope.COMMAND_EFFECT, 'never-claimed')).resolves.toBeUndefined()
	})
})
