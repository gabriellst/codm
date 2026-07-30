import { BaseDomainEvent, z } from '@codm/core-typescript'

/**
 * Context-private fact: a workspace was removed. The internal bridge maps it to the frozen
 * `integration.workspace.removed` so BC4/BC5 invalidate references to it.
 */
export const WorkspaceRemovedEventSchema = z.domainEvent({
	workspaceId: z.string(),
	path: z.string(),
})

export class WorkspaceRemovedEvent extends BaseDomainEvent<typeof WorkspaceRemovedEventSchema> {
	static override readonly name = 'workspace.removed' as const
	static readonly schema = WorkspaceRemovedEventSchema
}
