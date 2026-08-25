import { z, type ZodType } from 'zod'
import { type BaseEvent } from './BaseEvent'
import { Handler } from './Handler'
import type { Transaction } from '../services/UnitOfWork'

interface EventClass<S extends ZodType = ZodType> {
	name: string
	schema: S
	new (...args: any[]): BaseEvent
}

type EventClassOrArray = EventClass | readonly EventClass[]

type EventClassesOf<E extends EventClassOrArray> = E extends readonly EventClass[] ? E[number] : E

type SchemaOf<E extends EventClassOrArray> = EventClassesOf<E>['schema']

/**
 * Per-event handler. SPEC-12 generalised the shape to accept either a single
 * event class or `readonly [EventClass, EventClass, ...]` for multi-event
 * subscriptions. Single-event handlers behave as before; multi-event handlers
 * receive a union-typed event inside `handle()` and discriminate via
 * `event.name` switch.
 *
 * Sub-handler discipline (SPEC-12 §"Sub-handler discipline"): sub-handlers
 * `extends EventHandler` like any other handler but are NOT re-exported from
 * `handlers/internal.ts` / `handlers/external.ts` — the barrel is the
 * registration gate, so unexported handlers stay invisible to the mediator.
 */
export abstract class EventHandler<E extends EventClassOrArray> extends Handler<SchemaOf<E>, z.ZodVoid> {
	abstract readonly event: E

	// `this['input']` is the event INSTANCE that `execute()` constructs and hands to `handle()`, so
	// it carries the BaseEvent envelope (id/name/time) on TOP of the schema-inferred payload/entity
	// fields — letting handlers read `event.id` (the idempotency key) and `event.payload` without a
	// double cast. Additive over the schema output, so existing payload access is unchanged.
	declare readonly input: z.output<SchemaOf<E>> & InstanceType<EventClassesOf<E>>

	/** Names of every event this handler subscribes to. Mediator iterates this when registering. */
	get events(): readonly string[] {
		const e = this.event as EventClassOrArray
		return Array.isArray(e) ? (e as readonly EventClass[]).map(c => c.name) : [(e as EventClass).name]
	}

	/**
	 * @deprecated Use `events`. For single-event handlers returns `events[0]`;
	 * throws for multi-event handlers because the answer is ambiguous.
	 */
	get name(): string {
		const ev = this.events
		if (ev.length > 1) {
			throw new Error('EventHandler.name is ambiguous for multi-event handlers; use .events')
		}
		return ev[0]!
	}

	get inputSchema(): SchemaOf<E> {
		const e = this.event as EventClassOrArray
		if (Array.isArray(e)) {
			// For multi-event handlers, return the first class's schema as a placeholder.
			// Runtime validation is per-event inside handle(); the framework's input
			// inference here is only consulted for the BaseEvent envelope shape.
			return (e[0] as EventClass).schema as SchemaOf<E>
		}
		return (e as EventClass).schema as SchemaOf<E>
	}

	readonly outputSchema = z.void()

	override async execute(input: any): Promise<void> {
		const e = this.event as EventClassOrArray
		if (Array.isArray(e)) {
			// Multi-event: reconstruct the plain object into its declared class instance so handlers can
			// discriminate with `instanceof` (and read the BaseEvent envelope methods). The outbox
			// dispatcher hands us a PLAIN object (`toBaseEvent` — JSONB has no prototype), so passing it
			// straight through made every `event instanceof X` branch silently false and multi-event
			// republish/bridge handlers (e.g. PublishThreadIntegrationEvents) no-op'd under the real
			// outbox — the whole domain→integration event bridge dead in real mode, masked in tests where
			// the mock mediators pass the original live instances. Match by the discriminating `name` and
			// reconstruct; an already-live instance (mock path) or an unmatched name passes through.
			const classes = e as readonly EventClass[]
			if (classes.some(Cls => input instanceof Cls)) {
				await this.handle(input as this['input'])
				return
			}
			const Match = classes.find(Cls => Cls.name === (input as { name?: string } | null)?.name)
			await this.handle((Match ? new Match(input) : input) as this['input'])
			return
		}
		const Cls = e as EventClass
		const event = input instanceof Cls ? input : new Cls(input)
		await this.handle(event as this['input'])
	}

	// Narrow the abstract `handle` return type from
	// `Promise<this['output']>` to `Promise<void>`. With outputSchema
	// = z.void() the inferred this['output'] already resolves to
	// void, but TypeScript can't see through the generic indirection
	// from inside subclass bodies — so without this override every
	// subclass needed to cast its bare `return undefined` to satisfy
	// the generic return type. Concrete subclasses now `return` (or
	// omit it) cleanly.
	protected abstract override handle(input: this['input'], tx?: Transaction): Promise<void>
}
