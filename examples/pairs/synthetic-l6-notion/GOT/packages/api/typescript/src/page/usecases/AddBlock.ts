import { injectable } from 'tsyringe-neo'
import { BaseError, Handler, z, type Transaction } from '@template/core-typescript'
import { BlockType } from '@template/contracts-typescript/wire/enums'

import { PageRepository } from '../repositories/PageRepository'
import { findBlock } from '../objects/Block'
import { BlockAddedEvent } from '../events'
import type { PageApplicationErrors } from '../errors'

export const AddBlockInputSchema = z.object({
	pageId: z.uuid(),
	type: z.enum(BlockType),
	content: z.string(),
	parentBlockId: z.uuid().nullable().optional(),
})

export const AddBlockOutputSchema = z.object({
	blockId: z.uuid(),
})

@injectable()
export class AddBlock extends Handler<typeof AddBlockInputSchema, typeof AddBlockOutputSchema> {
	readonly name = 'add_block' as const
	readonly inputSchema = AddBlockInputSchema
	readonly outputSchema = AddBlockOutputSchema

	constructor(private readonly pages: PageRepository) {
		super()
	}

	protected async handle(input: this['input'], tx?: Transaction): Promise<this['output']> {
		return this.withTransaction(tx, async tx => {
			const page = await this.pages.findById(input.pageId, tx)
			if (!page) throw new BaseError<PageApplicationErrors>('PAGE_NOT_FOUND')

			const blockId = page.addBlock({
				type: input.type,
				content: input.content,
				parentBlockId: input.parentBlockId ?? null,
			})

			await this.pages.save(page, tx)

			const block = findBlock(page.blocks, blockId)!

			await this.domainEventRepository.save(
				new BlockAddedEvent({
					entityId: page.id.value,
					ownerId: page.workspaceId,
					payload: {
						pageId: page.id.value,
						workspaceId: page.workspaceId,
						blockId,
						parentBlockId: input.parentBlockId ?? null,
						block,
					},
				}),
				tx,
			)

			return { blockId }
		})
	}
}
