import { Repository } from '@codedm/core-typescript'
import type { Transaction } from '@codedm/core-typescript'
import type { Board } from '../entities/Board'

export abstract class BoardRepository extends Repository<Board> {
	abstract findById(boardId: string, tx?: Transaction): Promise<Board | undefined>
	abstract findByStoreId(storeId: string, tx?: Transaction): Promise<Board[]>
}
