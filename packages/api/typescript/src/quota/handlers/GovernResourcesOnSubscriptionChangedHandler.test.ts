import { describe, it, expect } from 'bun:test'
import { SubscriptionChangedEvent } from '@template/contracts-typescript/wire/events'
import { ResourceLimitEnforcer } from '@quota/services'
import { GovernResourcesOnSubscriptionChangedHandler } from './GovernResourcesOnSubscriptionChangedHandler'

// A spy enforcer records the ownerIds it was asked to enforce — the handler's whole job is to forward
// the envelope ownerId to the enforcer exactly once (AC-12).
class SpyEnforcer extends ResourceLimitEnforcer {
	readonly calls: string[] = []
	constructor() {
		// deps unused — enforce is overridden.
		super(undefined as never, undefined as never, undefined as never)
	}
	override async enforce(ownerId: string): Promise<void> {
		this.calls.push(ownerId)
	}
}

describe('GovernResourcesOnSubscriptionChangedHandler', () => {
	it('calls enforcer.enforce(ownerId) exactly once on a SubscriptionChangedEvent', async () => {
		const enforcer = new SpyEnforcer()
		const handler = new GovernResourcesOnSubscriptionChangedHandler(enforcer)

		await handler.handle(new SubscriptionChangedEvent({ ownerId: 'owner-1', payload: {} }))

		expect(enforcer.calls).toEqual(['owner-1'])
	})
})
