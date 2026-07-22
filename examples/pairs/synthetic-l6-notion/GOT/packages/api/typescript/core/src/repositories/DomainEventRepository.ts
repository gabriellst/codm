import { Repository } from './Repository'
import { BaseDomainEvent, type DomainEventSchemaConstraint } from '../types/BaseDomainEvent'
import type { Transaction } from '../services/UnitOfWork/UnitOfWork'

/**
 * A concrete domain-event class: constructable and carrying the static `name`
 * the events table is filtered by. Lets `findByType` infer the event's payload
 * type from the class so callers get fully-typed events back.
 */
export type DomainEventConstructor<E extends BaseDomainEvent<DomainEventSchemaConstraint> = BaseDomainEvent<DomainEventSchemaConstraint>> = (new (
	...args: any[]
) => E) & {
	readonly name: string
}

export abstract class DomainEventRepository extends Repository<BaseDomainEvent<DomainEventSchemaConstraint>> {
	abstract findById(id: string, transaction?: Transaction): Promise<BaseDomainEvent<DomainEventSchemaConstraint> | undefined>

	/**
	 * Read-side: all persisted events of a given type, oldest-first, rehydrated
	 * into typed event instances (payload typed from the event class). This is
	 * how tests and read flows assert "this domain event was persisted" WITHOUT
	 * resolving DrizzleClient or hand-querying the events table.
	 *
	 *   const evs = await repo.findByType(StoreMemberRoleChangedEvent)
	 *   expect(evs[0].payload.newRole).toBe(Role.ADMIN)   // fully typed, no cast
	 */
	abstract findByType<E extends BaseDomainEvent<DomainEventSchemaConstraint>>(eventClass: DomainEventConstructor<E>, transaction?: Transaction): Promise<E[]>

	/**
	 * Persist multiple domain events atomically inside the given transaction.
	 * Mirrors `save(event, tx)` but accepts an array — collapses the
	 * `for (const e of events) await this.save(e, tx)` boilerplate that
	 * callers (stream handlers, use cases with many raised events) would
	 * otherwise duplicate everywhere.
	 *
	 * Order is preserved.
	 */
	abstract saveMany(events: BaseDomainEvent<DomainEventSchemaConstraint>[], transaction?: Transaction): Promise<void>

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
	abstract saveIfNotExists(event: BaseDomainEvent<DomainEventSchemaConstraint>, transaction?: Transaction): Promise<boolean>

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
	): Promise<{ items: BaseDomainEvent<DomainEventSchemaConstraint>[]; total: number }>
}
