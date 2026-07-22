import { describe, it, expect } from 'bun:test'
import { container } from 'tsyringe-neo'

import { QuotaEntitlement, MockQuotaEntitlement, type Entitlement } from './QuotaEntitlement'
import { QuotaUsageSource } from './QuotaUsageSource'
import { QuotaGate } from './QuotaGate'
import { QuotaKey } from '@template/contracts-typescript/wire/enums'

const OWNER = 'quota-gate-owner'

/** Test double: always reports the same fixed usage count, regardless of key/window. */
class FixedQuotaUsageSource extends QuotaUsageSource {
	constructor(private readonly value: number) {
		super()
	}
	async usage(): Promise<number> {
		return this.value
	}
}

function buildGate(entitlement: Entitlement, usage: number): QuotaGate {
	const mockEntitlement = new MockQuotaEntitlement()
	mockEntitlement.seed(OWNER, entitlement)

	const testContainer = container.createChildContainer()
	testContainer.registerInstance(QuotaEntitlement as never, mockEntitlement)
	testContainer.registerInstance(QuotaUsageSource as never, new FixedQuotaUsageSource(usage))

	return testContainer.resolve(QuotaGate)
}

describe('QuotaGate', () => {
	it('rejects a hard-limit key at limit', async () => {
		const gate = buildGate({ [QuotaKey.EXAMPLE_KEY]: { limit: 1, metered: false } }, 1)

		await expect(gate.assertCanPerform(OWNER, QuotaKey.EXAMPLE_KEY)).rejects.toMatchObject({ name: 'QUOTA_LIMIT_EXCEEDED' })
	})

	it('allows a hard-limit key under limit', async () => {
		const gate = buildGate({ [QuotaKey.EXAMPLE_KEY]: { limit: 1, metered: false } }, 0)

		await expect(gate.assertCanPerform(OWNER, QuotaKey.EXAMPLE_KEY)).resolves.toBeUndefined()
	})

	it('never blocks a metered key even over limit', async () => {
		const gate = buildGate({ [QuotaKey.EXAMPLE_KEY]: { limit: 50, metered: true } }, 999999)

		await expect(gate.assertCanPerform(OWNER, QuotaKey.EXAMPLE_KEY)).resolves.toBeUndefined()
	})
})
