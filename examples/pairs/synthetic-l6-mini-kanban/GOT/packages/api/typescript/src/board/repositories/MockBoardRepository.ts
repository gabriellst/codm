import { injectable } from 'tsyringe-neo'
import type { Transaction } from '@template/core-typescript'
import { Board } from '../entities/Board'
import { BoardRepository } from './BoardRepository'

@injectable()
export class MockBoardRepository extends BoardRepository {
	private boards = new Map<string, Board>()

	async findById(boardId: string, _tx?: Transaction): Promise<Board | undefined> {
		return this.boards.get(boardId)
	}

	async findByStoreId(storeId: string, _tx?: Transaction): Promise<Board[]> {
		return [...this.boards.values()].filter(b => b.storeId === storeId)
	}

	async save(entity: Board, _tx?: Transaction): Promise<Board> {
		entity.incrementVersion()
		this.boards.set(entity.id.value, entity)
		return entity
	}

	async delete(id: string, _tx?: Transaction): Promise<void> {
		this.boards.delete(id)
	}

	seed(board: Board): void {
		this.boards.set(board.id.value, board)
	}

	clear(): void {
		this.boards.clear()
	}
}
