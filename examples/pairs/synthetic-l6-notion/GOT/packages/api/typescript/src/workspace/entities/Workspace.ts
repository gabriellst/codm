import Z from 'zod'
import { AggregateRoot, Id, z } from '@template/core-typescript'

export const WorkspaceSchema = z.object({
	name: z.string().min(1),
	ownerId: z.instance(Id),
})

export type WorkspaceProps = Z.infer<typeof WorkspaceSchema>

export class Workspace extends AggregateRoot<typeof WorkspaceSchema> {
	static override schema = WorkspaceSchema

	static create(data: { name: string; ownerId: string }): Workspace {
		return new Workspace({
			id: crypto.randomUUID(),
			name: data.name,
			ownerId: data.ownerId,
		})
	}
}

export interface Workspace extends WorkspaceProps {}
