import { Repository } from './Repository'
import { BaseDomainEvent } from '../types/BaseDomainEvent'
import type { AnyIntegrationEvent } from '../types/BaseIntegrationEvent'
import type { Transaction } from '../services/UnitOfWork/UnitOfWork'

/**
 * A concrete domain-event class: constructable and carrying the static `name`
 * the events table is filtered by. Lets `findByType` infer the event's payload
 * type from the class so callers get fully-typed events back.
 */
export type DomainEventConstructor<E extends BaseDomainEvent = BaseDomainEvent> = (new (
	...args: any[]
) => E) & {
	readonly name: string
}

export abstract class DomainEventRepository extends Repository<BaseDomainEvent> {
	abstract findById(id: string, transaction?: Transaction): Promise<BaseDomainEvent | undefined>

	/**
	 * Read-side: all persisted events of a given type, oldest-first, rehydrated
	 * into typed event instances (payload typed from the event class). This is
	 * how tests and read flows assert "this domain event was persisted" WITHOUT
	 * resolving the driver or hand-querying the events table.
	 *
	 *   const evs = await repo.findByType(StoreMemberRoleChangedEvent)
	 *   expect(evs[0].payload.newRole).toBe(Role.ADMIN)   // fully typed, no cast
	 */
	abstract findByType<E extends BaseDomainEvent>(eventClass: DomainEventConstructor<E>, transaction?: Transaction): Promise<E[]>

	/**
	 * All events with the given `name` whose timestamp is at/after `since` — the SWEEP read of the
	 * append-only log used by reconciliation (e.g. refund expectations within a poll window).
	 * Ordered oldest-first so the consumer can group/deduplicate deterministically.
	 */
	abstract listByNameSince(name: string, since: Date, transaction?: Transaction): Promise<BaseDomainEvent[]>

	/**
	 * Persist multiple domain events atomically inside the given transaction.
	 * Mirrors `save(event, tx)` but accepts an array — collapses the
	 * `for (const e of events) await this.save(e, tx)` boilerplate that
	 * callers (stream handlers, use cases with many raised events) would
	 * otherwise duplicate everywhere.
	 *
	 * Order is preserved.
	 */
	abstract saveMany(events: BaseDomainEvent[], transaction?: Transaction): Promise<void>

	/**
	 * Idempotent save. Returns `true` if the event was inserted, `false` if a
	 * pre-existing row blocked the write (typically via a partial unique index
	 * on (entity_id) WHERE name = '...'). Atomic at the DB level — no
	 * pre-check + insert race window.
	 *
	 * Use for "received from external system" events where the use case sets a
	 * deterministic entityId derived from the upstream event id. The first
	 * write wins; subsequent retries get `false` and the use case returns an
	 * idempotent ack without re-running side-effects.
	 */
	abstract saveIfNotExists(event: BaseDomainEvent, transaction?: Transaction): Promise<boolean>

	/**
	 * Read-side: paginated lookup of an actor's events filtered by event-name
	 * prefix. Used by per-actor history queries (e.g., billing's
	 * ListSubscriptionEventHistory filters `ownerId = userId` + name prefix
	 * `'billing.subscription.'`). Returns events newest-first.
	 *
	 * The `nameLike` arg is a SQL LIKE pattern — callers pass `'billing.%'`
	 * or `'billing.subscription.%'`, the repo wraps with `name LIKE $1`.
	 */
	abstract findByOwnerIdAndNameLike(
		ownerId: string,
		nameLike: string,
		opts: { limit: number; offset: number },
		transaction?: Transaction,
	): Promise<{ items: BaseDomainEvent[]; total: number }>

	/**
	 * Most recent event with the given `name` whose `entityId` matches — the append-only log
	 * read used to REHYDRATE event-carried flow state on a delivery path that doesn't have it in
	 * scope (e.g. the webhook charge-failed handler re-reading the invoice's `issued` event to
	 * recover the optimistic-upgrade pair the synchronous path forwards directly). Returns
	 * `undefined` when no such event exists.
	 */
	abstract findLatestByEntityIdAndName(entityId: string, name: string, transaction?: Transaction): Promise<BaseDomainEvent | undefined>

	/**
	 * Persist a cross-context integration event (`BaseIntegrationEvent`) into the same
	 * events+outbox tables `save()` uses, atomically inside the given transaction — the
	 * at-least-once outbox delivery path, instead of a post-commit `externalMediator.publish(...)`
	 * that a crash can drop.
	 *
	 * Integration events have no natural `entityId` (they describe a cross-context fact about an
	 * owner/tenant, not a single aggregate), so the append-only `events` log row leaves it null.
	 */
	abstract saveIntegrationEvent(event: AnyIntegrationEvent, transaction?: Transaction): Promise<AnyIntegrationEvent>

	/**
	 * Batch sibling of `saveIntegrationEvent` — one call for a sweep's whole set of thin triggers.
	 * The default folds `saveIntegrationEvent` per event (mocks inherit the right semantics for
	 * free); the Drizzle implementation overrides with two bulk inserts. Order is preserved.
	 */
	async saveIntegrationEventMany(events: AnyIntegrationEvent[], transaction?: Transaction): Promise<void> {
		for (const event of events) await this.saveIntegrationEvent(event, transaction)
	}
}
