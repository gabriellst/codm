import Z from 'zod'
import { AggregateRoot, BaseError, z } from '@codedm/core-typescript'
import { BlockType } from '@codedm/contracts-typescript/wire/enums'
import { BlockSchema, findBlock, isContainer, type BlockProps } from '../objects/Block'
import type { PageDomainErrors } from '../errors'

export const PageSchema = z.object({
	workspaceId: z.uuid(),
	parentPageId: z.uuid().nullable(),
	title: z.string().min(1),
	blocks: z.array(BlockSchema).default([]),
})

export type PageProps = Z.infer<typeof PageSchema>

export class Page extends AggregateRoot<typeof PageSchema> {
	static override schema = PageSchema

	static create(data: { workspaceId: string; parentPageId: string | null; title: string }): Page {
		return new Page({ id: crypto.randomUUID(), workspaceId: data.workspaceId, parentPageId: data.parentPageId, title: data.title, blocks: [] })
	}

	addBlock({ type, content, parentBlockId }: { type: BlockType; content: string; parentBlockId: string | null }): string {
		const newId = crypto.randomUUID()
		const node: BlockProps = { id: newId, type, content, order: 0, children: [] }
		if (parentBlockId === null) {
			node.order = this.blocks.length
			this.blocks = [...this.blocks, node]
		} else {
			const parent = findBlock(this.blocks, parentBlockId)
			if (!parent) throw new BaseError<PageDomainErrors>('BLOCK_NOT_FOUND')
			if (!isContainer(parent.type)) throw new BaseError<PageDomainErrors>('BLOCK_PARENT_NOT_CONTAINER')
			node.order = parent.children.length
			parent.children = [...parent.children, node]
		}
		this.validate()
		return newId
	}

	editBlock({ blockId, content }: { blockId: string; content: string }): void {
		const block = findBlock(this.blocks, blockId)
		if (!block) throw new BaseError<PageDomainErrors>('BLOCK_NOT_FOUND')
		block.content = content
		this.validate()
	}
}

export interface Page extends PageProps {}
