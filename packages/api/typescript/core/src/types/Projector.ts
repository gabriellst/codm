import type { Transaction } from '../services/UnitOfWork'

/**
 * Base class for read-side handlers — one Projector per Projection.
 * Subscribes to a union of events; implementation switches on event.name.
 * Async via outbox by default; can be invoked inline by a use case for
 * read-after-write consistency.
 *
 * ref: .claude/skills/projector/SKILL.md
 */
export abstract class Projector<E = any> {
	/** Event names this projector listens to. BoundedContext.create registers each on InternalMediator. */
	abstract readonly events: readonly string[]

	/** Implementations switch on event.name. */
	abstract handle(event: E, tx?: Transaction): Promise<void>
}
