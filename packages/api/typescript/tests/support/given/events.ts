// Seed a persisted domain event for query-over-events use cases (e.g. billing's
// ListSubscriptionEventHistory reads the events table as its read-model).
// This is repo-direct (never the outbox / givenEvent — that's bp-16, cross-process only).
// NOTE: events carry no createdAt; the table assigns it at insert. For ordering,
// assert set membership/count — do NOT setTimeout between saves (bp-22).
import type { BaseDomainEvent } from '@codm/core-typescript'
import { DomainEventRepository } from '@codm/core-typescript'
import type { TestBedLike } from './types'

/**
 * Structural mirror of `BaseDomainEvent`'s public surface (`core/src/types/{BaseEvent,
 * BaseDomainEvent}.ts`) — every field on both classes is `readonly` and nothing is
 * private/protected, so this is a faithful, cast-free stand-in: any real subclass instance
 * (`OwnerCreatedEvent`, …) already satisfies it via ordinary class covariance, and a plain literal
 * seed built from this shape satisfies it too. This is what lets the public `/testing` contract
 * (`testing.d.ts`'s `SeedDomainEvent`) stay a plain re-export of this given's own parameter type
 * instead of needing a bridge cast at the `testing.ts` boundary.
 */
export interface SeedDomainEvent {
	readonly name: string
	readonly id: string
	readonly time: string
	readonly payload: object
	readonly entityId?: string
	readonly ownerId?: string
	toJSON(): unknown
	serialize(): string
}

export async function givenDomainEvent(testBed: TestBedLike, event: SeedDomainEvent): Promise<void> {
	/**
	 * ONE documented cast, at the source. `DomainEventRepository.save` is typed against
	 * `BaseDomainEvent`'s DEFAULT generic (`typeof BaseDomainEventSchema`), whose `payload` Zod
	 * infers as an empty-schema `{}` — narrower than this given's `payload: object` (deliberately
	 * wide: real callers pass concrete subclasses with their OWN non-empty payload shape). Widening
	 * `SeedDomainEvent.payload` to match would weaken what the public contract actually promises
	 * (any object), and narrowing the repository's parameter is out of scope here (it is the
	 * write-side contract every domain event in every context saves through). The nominal quirk is
	 * generic-default noise, not a real structural mismatch — every field this given's caller can
	 * observe already lines up.
	 */
	await testBed.resolve(DomainEventRepository).save(event as BaseDomainEvent)
}
