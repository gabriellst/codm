import { injectable } from 'tsyringe-neo'
import { Handler, z, type Transaction } from '@template/core-typescript'

import { Page } from '../entities/Page'
import { PageRepository } from '../repositories/PageRepository'
import { PageCreatedEvent } from '../events'

export const CreatePageInputSchema = z.object({
	ownerId: z.uuid(),
	workspaceId: z.uuid(),
	parentPageId: z.uuid().nullable().optional(),
	title: z.string().min(1),
})

export const CreatePageOutputSchema = z.object({
	pageId: z.uuid(),
})

@injectable()
export class CreatePage extends Handler<typeof CreatePageInputSchema, typeof CreatePageOutputSchema> {
	readonly name = 'create_page' as const
	readonly inputSchema = CreatePageInputSchema
	readonly outputSchema = CreatePageOutputSchema

	constructor(private readonly pages: PageRepository) {
		super()
	}

	protected async handle(input: this['input'], tx?: Transaction): Promise<this['output']> {
		return this.withTransaction(tx, async tx => {
			const page = Page.create({
				workspaceId: input.workspaceId,
				parentPageId: input.parentPageId ?? null,
				title: input.title,
			})

			await this.pages.save(page, tx)

			await this.domainEventRepository.save(
				new PageCreatedEvent({
					entityId: page.id.value,
					ownerId: input.workspaceId,
					payload: { page: page.toJSON() },
				}),
				tx,
			)

			return { pageId: page.id.value }
		})
	}
}
