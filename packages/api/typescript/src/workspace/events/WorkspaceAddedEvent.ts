import { BaseDomainEvent, z } from '@codm/core-typescript'
import { WorkspaceBadge } from '@codm/contracts-typescript/wire/enums'

/**
 * Context-private fact: a project folder was registered. Stays internal to BC2 (no downstream
 * context needs a workspace-added signal — only removal invalidates refs, so only that is bridged
 * to a frozen integration event).
 */
export const WorkspaceAddedEventSchema = z.domainEvent({
	workspaceId: z.string(),
	path: z.string(),
	badges: z.array(z.enum(WorkspaceBadge)),
})

export class WorkspaceAddedEvent extends BaseDomainEvent<typeof WorkspaceAddedEventSchema> {
	static override readonly name = 'workspace.added' as const
	static readonly schema = WorkspaceAddedEventSchema
}
