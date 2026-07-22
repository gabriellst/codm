import { injectable } from 'tsyringe-neo'
import type { Transaction } from '@codedm/core-typescript'
import { Page } from '../../entities/Page'
import { PageRepository } from './PageRepository'

@injectable()
export class MockPageRepository extends PageRepository {
	private rows = new Map<string, Page>()

	async findById(id: string, _tx?: Transaction): Promise<Page | undefined> {
		return this.rows.get(id)
	}

	async save(page: Page, _tx?: Transaction): Promise<Page> {
		page.incrementVersion()
		this.rows.set(page.id.value, page)
		return page
	}

	async delete(id: string, _tx?: Transaction): Promise<void> {
		this.rows.delete(id)
	}

	seed(page: Page): void {
		this.rows.set(page.id.value, page)
	}

	clear(): void {
		this.rows.clear()
	}
}
