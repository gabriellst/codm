import { BaseDomainEvent, z } from '@template/core-typescript'
import { WorkspaceSchema } from '../entities/Workspace'

export const WorkspaceCreatedEventSchema = z.domainEvent({
	workspace: WorkspaceSchema.input(),
})

export class WorkspaceCreatedEvent extends BaseDomainEvent<typeof WorkspaceCreatedEventSchema> {
	static override readonly name = 'workspace.workspace.created' as const
	static readonly schema = WorkspaceCreatedEventSchema
}
