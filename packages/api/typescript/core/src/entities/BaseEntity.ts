import { Id } from '../objects/Id'
import { ValueObject } from '../objects/ValueObject'
import { BaseError } from '../types/BaseError'
import type { BaseDomainEvent, DomainEventSchemaConstraint } from '../types/BaseDomainEvent'
import type { z, ZodObject, ZodRawShape, ZodType } from 'zod'
import type { BaseDomainErrors } from '../errors'

/** Widest accepted domain event shape — any subclass schema matching the constraint. */
type AnyDomainEvent = BaseDomainEvent<DomainEventSchemaConstraint>

export interface BaseEntityProps {
	id?: Id | string
	createdAt?: Date
	updatedAt?: Date
	version?: number
}

export abstract class BaseEntity<T extends ZodObject = ZodObject<ZodRawShape>> extends ValueObject {
	static schema?: ZodType
	private domainEvents: AnyDomainEvent[] = []

	id: Id = new Id()
	createdAt: Date = new Date()
	updatedAt: Date = new Date()
	version = 1

	constructor(props?: z.input<T> & BaseEntityProps) {
		super()
		if (!props) return

		const schema = (this.constructor as typeof BaseEntity).schema
		const result = schema?.safeParse(props)

		if (result && !result.success) {
			throw new BaseError<BaseDomainErrors>('INVALID_ENTITY', result.error.issues[0]?.message)
		}

		// Assign transformed domain props (schema applies .transform())
		Object.assign(this, result?.data ?? props)

		// Handle base entity props explicitly (id accepts string or Id)
		if (props.id != null) this.id = props.id instanceof Id ? props.id : new Id(props.id as string)
		if (props.createdAt != null) this.createdAt = props.createdAt
		if (props.updatedAt != null) this.updatedAt = props.updatedAt
		if (props.version != null) this.version = props.version
	}

	protected validate(): void {
		const schema = (this.constructor as typeof BaseEntity).schema
		if (!schema) return
		const result = schema.safeParse(this)
		if (!result.success) throw new BaseError(result.error.issues[0]!.message)
		Object.assign(this, result.data)
	}

	incrementVersion(): void {
		this.version++
		this.updatedAt = new Date()
	}

	/**
	 * Raise a domain event. Called from inside behavior methods when an
	 * aggregate transitions to a new state. Events accumulate until
	 * `pullDomainEvents()` is called (typically by a use case or handler
	 * that then persists them via `domainEventRepository.save`).
	 */
	protected addDomainEvent(event: AnyDomainEvent): void {
		this.domainEvents.push(event)
	}

	/**
	 * Drain and return all pending domain events. Clears the internal buffer.
	 * Callers iterate the returned array and persist each event via
	 * `domainEventRepository.save(event, tx)` inside the same transaction as
	 * the entity write.
	 */
	pullDomainEvents(): AnyDomainEvent[] {
		const events = this.domainEvents
		this.domainEvents = []
		return events
	}

	static transformed() {
		// biome-ignore lint/complexity/noThisInStatic: polymorphic this pattern — subclasses call BaseEntity.transformed() and `this` must resolve to the subclass constructor at runtime
		const Cls = this as unknown as { schema: ZodObject; new (props: unknown): BaseEntity }
		return Cls.schema.input().transform((v: unknown) => new Cls(v))
	}
}
