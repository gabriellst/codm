import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'bun:test'
import { container, type DependencyContainer } from 'tsyringe-neo'
import { DomainEventRepository } from '@codm/core-typescript'
import { OwnerCreatedEvent } from '@owner/events/OwnerCreatedEvent'
import { TestBed } from '../TestBed'
import { givenDomainEvent } from './events'
import { testId } from '../ids'

describe('givenDomainEvent', () => {
	let testBed: TestBed
	let testContainer: DependencyContainer

	beforeAll(async () => {
		testContainer = container.createChildContainer()
		testBed = await TestBed.create('integration', { testContainer, ownerId: 'integration-tenant' })
	})
	beforeEach(async () => {
		await testBed.reset()
	})
	afterAll(async () => {
		await testBed.destroy()
	})

	it('persists a domain event readable via findByType', async () => {
		const actorId = testId('user', '1')
		const ownerId = testId('owner', '1')
		await givenDomainEvent(
			testBed,
			new OwnerCreatedEvent({
				entityId: ownerId,
				ownerId: actorId,
				payload: {
					ownerId,
					name: 'Acme',
				},
			}),
		)

		const events = testBed.resolve(DomainEventRepository)
		const found = await events.findByType(OwnerCreatedEvent)
		expect(found).toHaveLength(1)
		expect(found[0]!.payload.name).toBe('Acme')
	})
})
