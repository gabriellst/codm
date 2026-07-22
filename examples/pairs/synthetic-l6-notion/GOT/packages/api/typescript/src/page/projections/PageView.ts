import Z from 'zod'
import { z } from '@codedm/core-typescript'
import { BlockSchema, findBlock, type BlockProps } from '../objects/Block'
import type { PageCreatedEvent, BlockAddedEvent, BlockEditedEvent } from '../events'

export const PageViewProjectionSchema = z.object({
	pageId: z.uuid(),
	workspaceId: z.uuid(),
	title: z.string(),
	blockTree: z.array(BlockSchema),
	childPages: z.array(z.object({ id: z.uuid(), title: z.string() })),
})

export type PageViewProjectionProps = Z.infer<typeof PageViewProjectionSchema>

/** Source of truth: every event that affects this projection. */
export type PageViewProjectionEvent = PageCreatedEvent | BlockAddedEvent | BlockEditedEvent

/**
 * Free record projection — no base class, no invariants.
 * Constructor takes the full props. Overloaded `create` builds from a creating event.
 * Overloaded `applyEvent` mutates state from a mutating event.
 */
export class PageViewProjection {
	constructor(public props: PageViewProjectionProps) {}

	// ── Creation: typed overloads, one signature per creating event ──────
	static create(event: PageCreatedEvent): PageViewProjection
	static create(event: PageCreatedEvent): PageViewProjection {
		switch (event.name) {
			case 'page.page.created':
				return new PageViewProjection({
					// entityId carries the page's id (serialised from Id VO in the use case)
					pageId: event.entityId!,
					workspaceId: event.payload.page.workspaceId,
					title: event.payload.page.title,
					blockTree: [],
					childPages: [],
				})
		}
	}

	// ── Mutation: typed overloads, one signature per mutating event ──────
	applyEvent(event: BlockAddedEvent): void
	applyEvent(event: BlockEditedEvent): void
	applyEvent(event: BlockAddedEvent | BlockEditedEvent): void {
		switch (event.name) {
			case 'page.block.added': {
				const node = event.payload.block
				if (event.payload.parentBlockId == null) {
					this.props.blockTree.push(node)
				} else {
					const parent = findBlock(this.props.blockTree, event.payload.parentBlockId)
					if (parent) parent.children.push(node)
				}
				return
			}
			case 'page.block.edited': {
				const b = findBlock(this.props.blockTree, event.payload.blockId)
				if (b) b.content = event.payload.content
				return
			}
		}
	}
}
