import { BaseDomainEvent, z } from '@codedm/core-typescript'

export const WorkspaceCreatedEventSchema = z.domainEvent({
	workspaceId: z.uuid(),
	name: z.string(),
})

export class WorkspaceCreatedEvent extends BaseDomainEvent<typeof WorkspaceCreatedEventSchema> {
	static override readonly name = 'workspace.created' as const
	static readonly schema = WorkspaceCreatedEventSchema
}
