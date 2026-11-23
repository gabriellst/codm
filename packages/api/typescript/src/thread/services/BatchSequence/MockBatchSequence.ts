import { injectable } from 'tsyringe-neo'
import { BatchSequence } from './BatchSequence'

/** In-memory twin: one counter per conversation, starting at 1. */
@injectable()
export class MockBatchSequence extends BatchSequence {
	private readonly last = new Map<string, number>()

	async next(threadId: string): Promise<number> {
		const seq = (this.last.get(threadId) ?? 0) + 1
		this.last.set(threadId, seq)
		return seq
	}
}
