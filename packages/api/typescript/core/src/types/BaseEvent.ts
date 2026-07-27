import { Id } from '../objects/Id'
import { z, type ZodTypeAny } from 'zod'

export const BaseEventSchema = z.object({
	name: z.string(),
	id: z.string(),
	time: z.iso.datetime(),
	payload: z.object(),
})

export abstract class BaseEvent<Payload extends ZodTypeAny = ZodTypeAny> {
	declare static readonly name: string
	readonly name: string
	readonly id: string
	readonly time: string
	readonly payload: z.infer<Payload>

	constructor(payload: z.infer<Payload>) {
		this.name = (this.constructor as { name: string }).name
		this.payload = payload
		this.time = new Date().toISOString()
		// UUIDv7, NOT content-addressed. This was `Id.fromSeed(this.serialize())`, which gave two events
		// with the same (name, payload) inside one MILLISECOND the same id — and it hashed neither
		// entityId nor ownerId, because `BaseDomainEvent` assigns those AFTER this constructor runs, so
		// events of DIFFERENT entities and DIFFERENT owners collided too. Not theoretical:
		// `AgentRunStartedEvent` fires once per turn on the same issue with a byte-identical payload BY
		// DESIGN. Those are distinct facts with no natural key — content-addressing was the wrong model
		// for them — and the collision surfaced as a hard `UNIQUE constraint failed: shared_events.id`
		// aborting the enclosing UnitOfWork.
		//
		// Dedupe is NOT lost: re-persisting the SAME instance still carries the same id, so the
		// `ON CONFLICT(id) DO NOTHING` on the redelivery paths still collapses it. Only a path that
		// RECONSTRUCTS an equivalent event and expects the same id would break, and the single such path
		// (Go's `derivedEventID`, channel_sync_handler) derives from the SOURCE event id and never used
		// this hash. `Id.fromSeed` stays — it is the cross-language deterministic id for integration
		// IDENTITY, locked by golden tests on both sides.
		this.id = Id.value()
	}

	toJSON() {
		return Object.assign({ name: this.name }, this)
	}

	serialize(): string {
		return JSON.stringify(this)
	}
}
