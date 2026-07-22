import { injectable } from 'tsyringe-neo'
import { BaseError, Handler, z, type Transaction } from '@codedm/core-typescript'

import { PageRepository } from '../repositories/PageRepository'
import { BlockEditedEvent } from '../events'
import type { PageApplicationErrors } from '../errors'

export const EditBlockInputSchema = z.object({
	pageId: z.uuid(),
	blockId: z.uuid(),
	content: z.string(),
})

export const EditBlockOutputSchema = z.object({
	blockId: z.uuid(),
})

@injectable()
export class EditBlock extends Handler<typeof EditBlockInputSchema, typeof EditBlockOutputSchema> {
	readonly name = 'edit_block' as const
	readonly inputSchema = EditBlockInputSchema
	readonly outputSchema = EditBlockOutputSchema

	constructor(private readonly pages: PageRepository) {
		super()
	}

	protected async handle(input: this['input'], tx?: Transaction): Promise<this['output']> {
		return this.withTransaction(tx, async tx => {
			const page = await this.pages.findById(input.pageId, tx)
			if (!page) throw new BaseError<PageApplicationErrors>('PAGE_NOT_FOUND')

			page.editBlock({ blockId: input.blockId, content: input.content })

			await this.pages.save(page, tx)

			await this.domainEventRepository.save(
				new BlockEditedEvent({
					entityId: page.id.value,
					ownerId: page.workspaceId,
					payload: {
						pageId: page.id.value,
						workspaceId: page.workspaceId,
						blockId: input.blockId,
						content: input.content,
					},
				}),
				tx,
			)

			return { blockId: input.blockId }
		})
	}
}
