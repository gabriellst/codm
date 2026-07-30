import { DomainEventRepository, type DomainEventConstructor } from './DomainEventRepository'
import { BaseDomainEvent } from '../types/BaseDomainEvent'
import type { AnyIntegrationEvent } from '../types/BaseIntegrationEvent'
import { DrizzleClient } from '../db'
import { events, outbox } from '@codedm/contracts/db'
// The lane literal comes from the FROZEN cross-boundary enum, not a retyped string —
// the Go side discriminates on these exact values.
import { OutboxSource } from '@codedm/contracts-typescript/wire/enums'
import { and, asc, desc, eq, gte, like, sql } from 'drizzle-orm'
import { injectable } from 'tsyringe-neo'
import { tryCatchAsync } from '../utils/TryCatch'

@injectable()
export class DrizzleDomainEventRepository extends DomainEventRepository {
	constructor(private db: DrizzleClient) {
		super()
	}

	async findById(id: string, transaction?: DrizzleClient): Promise<BaseDomainEvent | undefined> {
		const dbClient = transaction ?? this.db

		const result = await tryCatchAsync(async () => {
			const rows = await dbClient.select().from(events).where(eq(events.id, id)).limit(1)
			return rows[0]
		})

		if (!result.success) throw result.error
		if (!result.data) return undefined

		return this.toDomain(result.data)
	}

	async save(event: BaseDomainEvent, transaction?: DrizzleClient): Promise<BaseDomainEvent> {
		const dbClient = transaction ?? this.db

		await dbClient.insert(events).values(this.toPersistence(event))
		await dbClient.insert(outbox).values(this.toOutboxRow(event))

		return event
	}

	async saveMany(domainEvents: BaseDomainEvent[], transaction?: DrizzleClient): Promise<void> {
		if (domainEvents.length === 0) return

		const dbClient = transaction ?? this.db

		// Two bulk inserts instead of 2N per-row inserts. Drizzle's
		// `.insert().values([...])` batches into a single statement.
		await dbClient.insert(events).values(domainEvents.map(e => this.toPersistence(e)))
		await dbClient.insert(outbox).values(domainEvents.map(e => this.toOutboxRow(e)))
	}

	async saveIfNotExists(event: BaseDomainEvent, transaction?: DrizzleClient): Promise<boolean> {
		const dbClient = transaction ?? this.db

		// ON CONFLICT DO NOTHING catches any unique constraint — including
		// partial indexes like events_billing_webhook_received_entity_unq.
		// RETURNING is empty when the row was rejected.
		const inserted = await dbClient.insert(events).values(this.toPersistence(event)).onConflictDoNothing().returning({ id: events.id })

		if (inserted.length === 0) return false

		// If the events insert succeeded, the outbox row mirrors it. If we
		// skipped (duplicate), we MUST skip the outbox too — otherwise the
		// dispatcher delivers a duplicate event downstream.
		await dbClient.insert(outbox).values(this.toOutboxRow(event))
		return true
	}

	async delete(id: string, transaction?: DrizzleClient): Promise<void> {
		const dbClient = transaction ?? this.db

		const result = await tryCatchAsync(async () => {
			await dbClient.delete(events).where(eq(events.id, id))
		})

		if (!result.success) throw result.error
	}

	async findByOwnerIdAndNameLike(
		ownerId: string,
		nameLike: string,
		opts: { limit: number; offset: number },
		transaction?: DrizzleClient,
	): Promise<{ items: BaseDomainEvent[]; total: number }> {
		const dbClient = transaction ?? this.db

		const filters = and(eq(events.ownerId, ownerId), like(events.name, nameLike))

		const result = await tryCatchAsync(async () => {
			const [countRow] = await dbClient.select({ n: sql<number>`count(*)` }).from(events).where(filters)

			const rows = await dbClient
				.select()
				.from(events)
				.where(filters)
				.orderBy(desc(events.occurredAt))
				.limit(opts.limit)
				.offset(Math.max(0, opts.offset))

			return {
				items: rows.map(r => this.toDomain(r)),
				total: Number(countRow?.n ?? 0),
			}
		})

		if (!result.success) throw result.error
		return result.data
	}

	async findLatestByEntityIdAndName(entityId: string, name: string, transaction?: DrizzleClient): Promise<BaseDomainEvent | undefined> {
		const dbClient = transaction ?? this.db

		const result = await tryCatchAsync(async () => {
			const rows = await dbClient
				.select()
				.from(events)
				.where(and(eq(events.entityId, entityId), eq(events.name, name)))
				.orderBy(desc(events.occurredAt))
				.limit(1)
			return rows[0]
		})

		if (!result.success) throw result.error
		if (!result.data) return undefined

		return this.toDomain(result.data)
	}

	async saveIntegrationEvent(event: AnyIntegrationEvent, transaction?: DrizzleClient): Promise<AnyIntegrationEvent> {
		const dbClient = transaction ?? this.db

		await dbClient.insert(events).values(this.toIntegrationPersistence(event))
		await dbClient.insert(outbox).values(this.toIntegrationOutboxRow(event))

		return event
	}

	override async saveIntegrationEventMany(integrationEvents: AnyIntegrationEvent[], transaction?: DrizzleClient): Promise<void> {
		if (integrationEvents.length === 0) return

		const dbClient = transaction ?? this.db

		// Two bulk inserts instead of 2N per-row inserts (mirrors saveMany).
		await dbClient.insert(events).values(integrationEvents.map(e => this.toIntegrationPersistence(e)))
		await dbClient.insert(outbox).values(integrationEvents.map(e => this.toIntegrationOutboxRow(e)))
	}

	async listByNameSince(name: string, since: Date, transaction?: DrizzleClient): Promise<BaseDomainEvent[]> {
		const dbClient = transaction ?? this.db

		const result = await tryCatchAsync(async () => {
			return await dbClient
				.select()
				.from(events)
				.where(and(eq(events.name, name), gte(events.occurredAt, since)))
				.orderBy(asc(events.occurredAt))
		})

		if (!result.success) throw result.error

		return result.data.map(row => this.toDomain(row))
	}

	async findByType<E extends BaseDomainEvent>(eventClass: DomainEventConstructor<E>, transaction?: DrizzleClient): Promise<E[]> {
		const dbClient = transaction ?? this.db

		const result = await tryCatchAsync(async () => {
			const rows = await dbClient.select().from(events).where(eq(events.name, eventClass.name)).orderBy(events.occurredAt)
			// Rehydrate each row into a real event instance via its concrete class,
			// so the caller gets `E` with a typed payload (no row/JSONB casts upstream).
			return rows.map(r => new eventClass({ entityId: r.entityId ?? undefined, ownerId: r.ownerId ?? undefined, payload: r.payload }))
		})

		if (!result.success) throw result.error
		return result.data
	}

	/**
	 * Accepted deviation (cc-bp-04): BaseDomainEvent is an abstract class — it cannot be
	 * instantiated from a plain DB row. The Drizzle row is structurally compatible at runtime
	 * (same fields: id, name, entityId, ownerId, payload, time) but TypeScript cannot verify
	 * this because the target is an abstract class with a constructor. A full fix requires a
	 * concrete DomainEvent factory or registry, which is out of scope for an append-only event log.
	 */
	private toDomain(row: typeof events.$inferSelect): BaseDomainEvent {
		return row as unknown as BaseDomainEvent
	}

	private toPersistence(event: BaseDomainEvent): typeof events.$inferInsert {
		return {
			id: event.id,
			name: event.name,
			entityId: event.entityId,
			ownerId: event.ownerId,
			payload: JSON.parse(JSON.stringify(event.payload)) as Record<string, unknown>,
			source: OutboxSource.api,
			occurredAt: new Date(event.time),
		}
	}

	private toOutboxRow(event: BaseDomainEvent): typeof outbox.$inferInsert {
		return {
			id: event.id,
			name: event.name,
			entityId: event.entityId,
			ownerId: event.ownerId,
			payload: event.toJSON() as unknown as Record<string, unknown>,
			source: OutboxSource.api,
		}
	}

	// Integration events carry no aggregate `entityId` (they describe a cross-context fact about an
	// owner/tenant), so the append-only `events` row leaves the uuid entityId column null.
	private toIntegrationPersistence(event: AnyIntegrationEvent): typeof events.$inferInsert {
		return {
			id: event.id,
			name: event.name,
			entityId: undefined,
			ownerId: event.ownerId,
			payload: JSON.parse(JSON.stringify(event.payload)) as Record<string, unknown>,
			source: OutboxSource.api,
			occurredAt: new Date(event.time),
		}
	}

	// Integration events carry no aggregate `entityId` (they describe a cross-context fact about an
	// owner/tenant), so the outbox row leaves the uuid entityId column null.
	//
	// THE LANE IS `integration`, NOT `api` (B3, decisions 4/5): `source` decides WHO CLAIMS the row, and
	// the claimant of an integration event is `SqlExternalMediator`, never the api-lane domain
	// dispatcher. On `api` the row would be handed to the domain dispatcher, which routes `integration.*`
	// names to `ExternalMediator.dispatch` — an in-memory fan-out with a 30s retry lease, i.e. exactly
	// the durability hole this change closes. The audit row in `events` stays on `api`: that column
	// records WHO PRODUCED the fact, and this daemon is the producer.
	private toIntegrationOutboxRow(event: AnyIntegrationEvent): typeof outbox.$inferInsert {
		return {
			id: event.id,
			name: event.name,
			entityId: undefined,
			ownerId: event.ownerId,
			payload: event.toJSON() as unknown as Record<string, unknown>,
			source: OutboxSource.integration,
		}
	}
}
