import { describe, it, expect, beforeEach } from 'bun:test'

import { ResourceLimitEnforcer } from './ResourceLimitEnforcer'
import { ResourceGovernor, type GovernableResource } from './ResourceGovernor'
import { ResourceGovernorRegistry } from './ResourceGovernorRegistry'
import { DefaultResourceGovernorRegistry } from './DefaultResourceGovernorRegistry'
import { MockQuotaEntitlement, type Entitlement } from './QuotaEntitlement'
import { MockPendingSelectionRepository } from '@quota/repositories'
import { QuotaKey } from '@template/contracts-typescript/wire/enums'

// R-2: no product governor exists in a generic template, so the enforcer test uses an in-memory
// `FakeGovernor` double (list oldest-first, batch lock/unlock via the abstract defaults) + a seeded
// `MockQuotaEntitlement` + the real `MockPendingSelectionRepository`. Pure unit test, no DB.
class FakeGovernor extends ResourceGovernor {
	private resources: GovernableResource[] = []

	/** Seed resources in creation order (oldest-first), all unlocked. */
	seed(ids: string[]): void {
		this.resources = ids.map((id, i) => ({ id, createdAt: new Date(2020, 0, 1 + i), locked: false }))
	}

	async list(): Promise<GovernableResource[]> {
		return this.resources.map(r => ({ ...r })) // snapshot copies; oldest-first
	}
	async lock(_ownerId: string, resourceId: string): Promise<void> {
		const r = this.resources.find(x => x.id === resourceId)
		if (r) r.locked = true
	}
	async unlock(_ownerId: string, resourceId: string): Promise<void> {
		const r = this.resources.find(x => x.id === resourceId)
		if (r) r.locked = false
	}
}

class FakeGovernorRegistry extends ResourceGovernorRegistry {
	constructor(private governor: ResourceGovernor) {
		super()
	}
	for(): ResourceGovernor {
		return this.governor
	}
	keys(): QuotaKey[] {
		return [QuotaKey.EXAMPLE_KEY]
	}
}

describe('ResourceLimitEnforcer', () => {
	let pending: MockPendingSelectionRepository
	let entitlement: MockQuotaEntitlement
	let governor: FakeGovernor
	let enforcer: ResourceLimitEnforcer
	const OWNER = 'owner-resource-limit-enforcer-1'

	beforeEach(() => {
		pending = new MockPendingSelectionRepository()
		entitlement = new MockQuotaEntitlement()
		governor = new FakeGovernor()
		enforcer = new ResourceLimitEnforcer(new FakeGovernorRegistry(governor), pending, entitlement)
	})

	const seedEntitlement = (limit: number | null) =>
		entitlement.seed(OWNER, { [QuotaKey.EXAMPLE_KEY]: { limit, metered: false } } as Entitlement)

	it('locks the excess using the pending selection, keeping the chosen resources', async () => {
		governor.seed(['u1', 'u2', 'u3'])
		await pending.save(OWNER, { [QuotaKey.EXAMPLE_KEY]: ['u3'] })
		seedEntitlement(1)

		await enforcer.enforce(OWNER)

		const list = await governor.list()
		expect(list.find(r => r.id === 'u3')?.locked).toBe(false)
		expect(list.filter(r => r.id !== 'u3').every(r => r.locked)).toBe(true)
		expect(await pending.findByOwner(OWNER)).toEqual({})
	})

	it('defaults to keeping the oldest N when there is no selection', async () => {
		governor.seed(['u1', 'u2', 'u3'])
		seedEntitlement(1)

		await enforcer.enforce(OWNER)

		const list = await governor.list() // oldest-first
		expect(list[0]!.locked).toBe(false)
		expect(list.slice(1).every(r => r.locked)).toBe(true)
	})

	it('tops up from default when a kept resource no longer exists', async () => {
		governor.seed(['u1', 'u2', 'u3'])
		await pending.save(OWNER, { [QuotaKey.EXAMPLE_KEY]: ['deleted-x'] }) // stale id, no such resource
		seedEntitlement(1)

		await enforcer.enforce(OWNER)

		const list = await governor.list()
		expect(list.filter(r => !r.locked)).toHaveLength(1) // never under quota with all locked
	})

	it('unlocks up to the new limit on an upgrade (oldest-first), clears the selection, and NEVER deletes', async () => {
		governor.seed(['u1', 'u2', 'u3'])
		// Downgrade first: locks u2 and u3, keeping only the oldest (u1) active.
		seedEntitlement(1)
		await enforcer.enforce(OWNER)

		seedEntitlement(2)
		await enforcer.enforce(OWNER)

		const list = await governor.list()
		expect(list).toHaveLength(3) // lock-don't-delete: every resource still present
		expect(list.filter(r => !r.locked)).toHaveLength(2)
		expect(list[0]!.locked).toBe(false)
		expect(list[1]!.locked).toBe(false)
		expect(await pending.findByOwner(OWNER)).toEqual({})
	})

	it('unlimited plan (limit === null) unlocks everything', async () => {
		governor.seed(['u1', 'u2', 'u3'])
		seedEntitlement(1)
		await enforcer.enforce(OWNER)

		seedEntitlement(null)
		await enforcer.enforce(OWNER)

		const list = await governor.list()
		expect(list.every(r => !r.locked)).toBe(true)
	})

	it('empty governor registry → the enforce loop is a no-op (generic-context guarantee)', async () => {
		const emptyEnforcer = new ResourceLimitEnforcer(new DefaultResourceGovernorRegistry({}), pending, entitlement)
		await expect(emptyEnforcer.enforce(OWNER)).resolves.toBeUndefined()
	})
})
