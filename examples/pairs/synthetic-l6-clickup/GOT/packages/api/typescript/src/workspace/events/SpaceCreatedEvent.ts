import { BaseDomainEvent, z } from '@template/core-typescript'

export const SpaceCreatedEventSchema = z.domainEvent({
	spaceId: z.uuid(),
	workspaceId: z.uuid(),
	name: z.string(),
})

export class SpaceCreatedEvent extends BaseDomainEvent<typeof SpaceCreatedEventSchema> {
	static override readonly name = 'workspace.space_created' as const
	static readonly schema = SpaceCreatedEventSchema
}
