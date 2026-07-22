import { injectable } from 'tsyringe-neo'
import { Projector } from '@codedm/core-typescript'
import type { Transaction } from '@codedm/core-typescript'
import { BlockAddedEvent, BlockEditedEvent, PageCreatedEvent } from '../../events'
import { PageViewProjection, type PageViewProjectionEvent } from '../PageView'
import { PageViewProjectionRepository } from '../PageViewProjectionRepository'

/**
 * Read-side counterpart of EventHandler. Drives PageViewProjection from events.
 *
 * Canonical mutation flow: find → projection.applyEvent(event) → save
 * Creation: repo.insertIfNew(PageViewProjection.create(event), tx)
 *
 * Async via outbox by default. A use case MAY invoke this synchronously
 * inside its UnitOfWork (`projector.handle(event, tx)`) for read-after-write
 * consistency — opt-in coupling.
 */
@injectable()
export class PageViewProjector extends Projector<PageViewProjectionEvent> {
	constructor(private repo: PageViewProjectionRepository) {
		super()
	}

	readonly events = ['page.page.created', 'page.block.added', 'page.block.edited']

	async handle(event: PageViewProjectionEvent, tx?: Transaction): Promise<void> {
		switch (event.name) {
			case 'page.page.created': {
				await this.repo.insertIfNew(PageViewProjection.create(event), tx)
				const parentPageId = event.payload.page.parentPageId
				if (parentPageId != null) {
					// entityId carries the new page's id
					const newPageId = event.entityId!
					const parent = await this.repo.findByKey(parentPageId, tx)
					if (parent) {
						parent.props.childPages.push({ id: newPageId, title: event.payload.page.title })
						await this.repo.save(parent, tx)
					}
				}
				return
			}
			case 'page.block.added': {
				const proj = await this.repo.findByKey(event.payload.pageId, tx)
				if (!proj) return
				proj.applyEvent(event)
				await this.repo.save(proj, tx)
				return
			}
			case 'page.block.edited': {
				const proj = await this.repo.findByKey(event.payload.pageId, tx)
				if (!proj) return
				proj.applyEvent(event)
				await this.repo.save(proj, tx)
				return
			}
			default: {
				const _exhaustive: never = event
				return _exhaustive
			}
		}
	}
}
