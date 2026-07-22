import { AggregateRoot, z } from '@template/core-typescript'
import Z from 'zod'
import { WorkspaceCreatedEvent } from '../events'

export const WorkspaceSchema = z.object({
	name: z.string().min(1),
})

export type WorkspaceProps = Z.infer<typeof WorkspaceSchema>

export class Workspace extends AggregateRoot<typeof WorkspaceSchema> {
	static override schema = WorkspaceSchema

	static create({ id, name }: { id: string; name: string }): Workspace {
		const workspace = new Workspace({ id, name })
		workspace.addDomainEvent(
			new WorkspaceCreatedEvent({
				entityId: id,
				ownerId: id,
				payload: { workspaceId: id, name },
			}),
		)
		return workspace
	}
}

export interface Workspace extends WorkspaceProps {}
