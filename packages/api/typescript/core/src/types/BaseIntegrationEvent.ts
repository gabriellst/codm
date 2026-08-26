import { BaseEvent } from './BaseEvent'
import { z, type ZodObject, type ZodTypeAny } from 'zod'

export const BaseIntegrationEventSchema = z.object({
	name: z.string(),
	payload: z.object(),
	ownerId: z.string(),
})

type EventSchemaConstraint = ZodObject<{ name: ZodTypeAny; payload: ZodTypeAny; ownerId: z.ZodString }>

/**
 * The widest integration-event type — any concrete wire event (whose schema pins `name` to a
 * `z.literal(...)`) is assignable to this, whereas the class's bare default pins `name` to
 * `z.string()` and — because the generic is invariant on the schema — rejects the literal.
 * Cross-context persistence APIs (`DomainEventRepository.saveIntegrationEvent`) accept
 * `AnyIntegrationEvent` so every wire event flows through them.
 */
export type AnyIntegrationEvent = BaseIntegrationEvent<EventSchemaConstraint>

export abstract class BaseIntegrationEvent<EventSchema extends EventSchemaConstraint = typeof BaseIntegrationEventSchema> extends BaseEvent<
	EventSchema['shape']['payload']
> {
	readonly ownerId: string

	constructor(data: Omit<z.infer<EventSchema>, 'name'>) {
		super(data.payload as z.infer<EventSchema['shape']['payload']>)
		this.ownerId = data.ownerId
	}
}
