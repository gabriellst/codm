import { DomainEventRepository, type DomainEventConstructor } from './DomainEventRepository'
import { BaseDomainEvent } from '../types/BaseDomainEvent'
import type { AnyIntegrationEvent } from '../types/BaseIntegrationEvent'
import { BaseError } from '../types/BaseError'
import type { BaseApplicationErrors } from '../errors/codes'
import { Transaction } from '../services/UnitOfWork/UnitOfWork'
import { injectable } from 'tsyringe-neo'

@injectable()
export class MockDomainEventRepository extends DomainEventRepository {
	private domainEvents = new Map<string, BaseDomainEvent>()
	// Mirrors the partial unique indexes on the events table. Mock dedupes
	// globally by `${name}:${entityId}` — broader than Postgres's partial
	// scope (real DB only dedupes the indexed names) but safe because
	// saveIfNotExists callers must opt in.
	private dedupe = new Set<string>()

	async findById(id: string, _transaction?: Transaction): Promise<BaseDomainEvent | undefined> {
		return this.domainEvents.get(id)
	}

	async save(entity: BaseDomainEvent, _transaction?: Transaction): Promise<BaseDomainEvent> {
		this.domainEvents.set(entity.id, entity)
		return entity
	}

	async saveMany(entities: BaseDomainEvent[], tx?: Transaction): Promise<void> {
		for (const entity of entities) {
			await this.save(entity, tx)
		}
	}

	async saveIfNotExists(entity: BaseDomainEvent, _transaction?: Transaction): Promise<boolean> {
		const key = `${entity.name}:${entity.entityId}`
		if (this.dedupe.has(key)) return false
		this.dedupe.add(key)
		this.domainEvents.set(entity.id, entity)
		return true
	}

	async delete(id: string, _transaction?: Transaction): Promise<void> {
		const deleted = this.domainEvents.delete(id)
		if (!deleted) {
			throw new BaseError<BaseApplicationErrors>('NOT_FOUND', `DomainEvent with id '${id}' not found`)
		}
	}

	async findLatestByEntityIdAndName(entityId: string, name: string, _transaction?: Transaction): Promise<BaseDomainEvent | undefined> {
		// Insertion order is preserved by Map; the last matching entry is the most recent.
		let latest: BaseDomainEvent | undefined
		for (const event of this.domainEvents.values()) {
			if (event.entityId === entityId && event.name === name) latest = event
		}
		return latest
	}

	async saveIntegrationEvent(event: AnyIntegrationEvent, _transaction?: Transaction): Promise<AnyIntegrationEvent> {
		// Stored in the same map as domain events — this mock only needs id-keyed lookup, so the
		// BaseDomainEvent-shaped map is reused (the two share the BaseEvent envelope).
		this.domainEvents.set(event.id, event as unknown as BaseDomainEvent)
		return event
	}

	async listByNameSince(name: string, since: Date, _transaction?: Transaction): Promise<BaseDomainEvent[]> {
		const matches: BaseDomainEvent[] = []
		for (const event of this.domainEvents.values()) {
			if (event.name === name && new Date(event.time) >= since) matches.push(event)
		}
		return matches.sort((a, b) => new Date(a.time).getTime() - new Date(b.time).getTime())
	}

	async findByType<E extends BaseDomainEvent>(eventClass: DomainEventConstructor<E>, _transaction?: Transaction): Promise<E[]> {
		// Stored values are the real event instances that were saved, so filtering
		// by name yields correctly-typed `E`s (oldest-first by insertion order).
		return Array.from(this.domainEvents.values()).filter((e): e is E => e.name === eventClass.name)
	}

	async findByOwnerIdAndNameLike(
		ownerId: string,
		nameLike: string,
		opts: { limit: number; offset: number },
		_transaction?: Transaction,
	): Promise<{ items: BaseDomainEvent[]; total: number }> {
		// SQL LIKE → JS RegExp: '%' becomes '.*'. Caller's pattern is trusted (internal API).
		const escapeRegexChar = (c: string): string => (/[.*+?^${}()|[\]\\]/.test(c) ? `\\${c}` : c)
		const pattern = nameLike
			.split('%')
			.map(seg => seg.split('').map(escapeRegexChar).join(''))
			.join('.*')
		const re = new RegExp(`^${pattern}$`)

		const matches = Array.from(this.domainEvents.values())
			.filter(e => e.ownerId === ownerId && re.test(e.name))
			.sort((a, b) => (a.time < b.time ? 1 : a.time > b.time ? -1 : 0))

		const offset = Math.max(0, opts.offset)
		return {
			items: matches.slice(offset, offset + opts.limit),
			total: matches.length,
		}
	}
}
