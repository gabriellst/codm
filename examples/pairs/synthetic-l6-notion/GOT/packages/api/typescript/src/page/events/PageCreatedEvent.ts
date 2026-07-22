import { BaseDomainEvent, z } from '@template/core-typescript'
import { PageSchema } from '../entities/Page'

export const PageCreatedEventSchema = z.domainEvent({
	page: PageSchema.input(),
})

export class PageCreatedEvent extends BaseDomainEvent<typeof PageCreatedEventSchema> {
	static override readonly name = 'page.page.created' as const
	declare readonly name: typeof PageCreatedEvent.name
	static readonly schema = PageCreatedEventSchema
}
