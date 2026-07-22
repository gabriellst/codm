import { AggregateRoot, z } from '@template/core-typescript'
import Z from 'zod'
import { SpaceList } from '../objects/SpaceList'
import { SpaceCreatedEvent, ListAddedEvent } from '../events'

export const SpaceSchema = z.object({
	workspaceId: z.uuid(),
	name: z.string().min(1),
	lists: z.array(z.instance(SpaceList)).default([]),
})

export type SpaceProps = Z.infer<typeof SpaceSchema>

export class Space extends AggregateRoot<typeof SpaceSchema> {
	static override schema = SpaceSchema

	static create({ workspaceId, name }: { workspaceId: string; name: string }): Space {
		const space = new Space({ workspaceId, name, lists: [] })
		space.addDomainEvent(
			new SpaceCreatedEvent({
				entityId: space.id.value,
				ownerId: workspaceId,
				payload: { spaceId: space.id.value, workspaceId, name },
			}),
		)
		return space
	}

	addList(name: string): string {
		const listId = crypto.randomUUID()
		const position = this.lists.length
		this.lists.push(new SpaceList({ id: listId, name, position }))
		this.addDomainEvent(
			new ListAddedEvent({
				entityId: this.id.value,
				ownerId: this.workspaceId,
				payload: { listId, spaceId: this.id.value, name, position },
			}),
		)
		return listId
	}

	hasList(listId: string): boolean {
		return this.lists.some(l => l.id === listId)
	}
}

export interface Space extends SpaceProps {}
