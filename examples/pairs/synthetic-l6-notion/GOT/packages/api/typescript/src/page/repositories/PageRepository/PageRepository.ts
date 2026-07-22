import { Repository } from '@template/core-typescript'
import type { Transaction } from '@template/core-typescript'
import { Page } from '../../entities/Page'

export abstract class PageRepository extends Repository<Page> {
	abstract findById(id: string, tx?: Transaction): Promise<Page | undefined>
}
