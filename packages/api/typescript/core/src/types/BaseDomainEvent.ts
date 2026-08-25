import { BaseEvent } from './BaseEvent'
import { z, type ZodObject, type ZodTypeAny } from 'zod'

export const BaseDomainEventSchema = z.object({
	// Both optional — some events (e.g. BillingWebhookReceivedEvent) carry a
	// computed entityId but no meaningful ownerId; pure "something happened"
	// events may have neither. Events that DO have entity/owner identity
	// (most domain events) still pass them at construction.
	entityId: z.string().optional(),
	ownerId: z.string().optional(),
	payload: z.object(),
})

export type DomainEventSchemaConstraint = ZodObject<{
	entityId: z.ZodOptional<z.ZodString>
	ownerId: z.ZodOptional<z.ZodString>
	payload: ZodTypeAny
}>

export abstract class BaseDomainEvent<EventSchema extends DomainEventSchemaConstraint = typeof BaseDomainEventSchema> extends BaseEvent<
	EventSchema['shape']['payload']
> {
	readonly entityId?: string
	readonly ownerId?: string

	constructor(data: z.infer<EventSchema>) {
		super(data.payload as z.infer<EventSchema['shape']['payload']>)
		this.entityId = data.entityId
		this.ownerId = data.ownerId
	}
}
