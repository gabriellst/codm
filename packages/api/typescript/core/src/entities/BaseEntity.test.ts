import { describe, expect, it } from 'bun:test'
import { BaseDomainEvent } from '../types/BaseDomainEvent'
import { z } from '../utils/schema'
import { BaseEntity } from './BaseEntity'

const TestEventSchema = z.domainEvent({ thing: z.string() })

class TestEvent extends BaseDomainEvent<typeof TestEventSchema> {
	static override readonly name = 'test.thing' as const
	static readonly schema = TestEventSchema
}

const TestEntitySchema = z.object({ name: z.string() })

class TestEntity extends BaseEntity<typeof TestEntitySchema> {
	static override schema = TestEntitySchema

	doSomething(): void {
		this.addDomainEvent(new TestEvent({ entityId: this.id.value, ownerId: 'owner-1', payload: { thing: 'did-it' } }))
	}
}

describe('BaseEntity domain event pattern', () => {
	it('pullDomainEvents returns empty array by default', () => {
		const entity = new TestEntity({ name: 'x' })
		expect(entity.pullDomainEvents()).toEqual([])
	})

	it('addDomainEvent accumulates events; pullDomainEvents drains them', () => {
		const entity = new TestEntity({ name: 'x' })
		entity.doSomething()
		entity.doSomething()

		const pulled = entity.pullDomainEvents()
		expect(pulled).toHaveLength(2)
		expect(pulled[0]).toBeInstanceOf(TestEvent)

		expect(entity.pullDomainEvents()).toEqual([])
	})
})
