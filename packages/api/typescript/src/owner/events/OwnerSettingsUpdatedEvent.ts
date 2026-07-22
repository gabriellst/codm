import { BaseDomainEvent, z } from '@codedm/core-typescript'
import { OwnerSchema } from '../entities/Owner'

export const OwnerSettingsUpdatedEventSchema = z.domainEvent({
	/** Full Owner entity snapshot at publish time (SPEC-08). */
	owner: OwnerSchema,
})

export class OwnerSettingsUpdatedEvent extends BaseDomainEvent<typeof OwnerSettingsUpdatedEventSchema> {
	static override readonly name = 'owner.settings_updated' as const
	static readonly schema = OwnerSettingsUpdatedEventSchema
}
