import { describe, it, expect, beforeAll, afterAll } from 'bun:test'
import { container, type DependencyContainer } from 'tsyringe-neo'
import { TestBed } from '@test/support'
import { QuotaGate, ResourceLimitEnforcer, QuotaEntitlement } from '@quota/services'
import { PendingSelectionRepository, QuotaOverrideRepository } from '@quota/repositories'

// Resolves every DI token the quota context registers (registry.ts) through the SAME path production
// uses (TestBed → registerAll(ALL_REGISTRIES) → tsyringe container) — proves the context wires up
// standalone, with ZERO product keys wired (the placeholder usage-source + governor-registry).
describe('quota bounded context', () => {
	let testBed: TestBed
	let testContainer: DependencyContainer

	beforeAll(async () => {
		testContainer = container.createChildContainer()
		testBed = await TestBed.create('integration', { testContainer, ownerId: 'integration-tenant' })
	})

	afterAll(async () => {
		await testBed.destroy()
	})

	it('resolves every quota-registered service and repository', () => {
		expect(testBed.resolve(QuotaGate)).toBeDefined()
		expect(testBed.resolve(ResourceLimitEnforcer)).toBeDefined()
		expect(testBed.resolve(QuotaEntitlement)).toBeDefined()
		expect(testBed.resolve(PendingSelectionRepository)).toBeDefined()
		expect(testBed.resolve(QuotaOverrideRepository)).toBeDefined()
	})
})
