// Seed a persisted domain event for query-over-events use cases (e.g. billing's
// ListSubscriptionEventHistory reads the events table as its read-model).
// This is repo-direct (never the outbox / givenEvent — that's bp-16, cross-process only).
// NOTE: events carry no createdAt; the table assigns it at insert. For ordering,
// assert set membership/count — do NOT setTimeout between saves (bp-22).
import type { BaseDomainEvent } from '@template/core-typescript'
import { DomainEventRepository } from '@template/core-typescript'
import type { TestBed } from '../TestBed'

export async function givenDomainEvent(testBed: TestBed, event: BaseDomainEvent): Promise<void> {
	await testBed.resolve(DomainEventRepository).save(event)
}
