import type { Transaction } from '@codedm/core-typescript'
import { PageViewProjection, type PageViewProjectionProps } from '../PageView'
import { PageViewProjectionRepository } from './PageViewProjectionRepository'

export class MockPageViewProjectionRepository extends PageViewProjectionRepository {
	private rows = new Map<string, PageViewProjectionProps>()

	async findByKey(pageId: string, _tx?: Transaction): Promise<PageViewProjection | null> {
		const row = this.rows.get(pageId)
		return row ? new PageViewProjection(row) : null
	}

	async save(projection: PageViewProjection, _tx?: Transaction): Promise<void> {
		this.rows.set(projection.props.pageId, projection.props)
	}

	async insertIfNew(projection: PageViewProjection, _tx?: Transaction): Promise<boolean> {
		const key = projection.props.pageId
		if (this.rows.has(key)) return false
		this.rows.set(key, projection.props)
		return true
	}
}
