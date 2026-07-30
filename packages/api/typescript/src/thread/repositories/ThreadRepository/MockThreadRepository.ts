import { injectable } from 'tsyringe-neo'
import { Thread, type TranscriptEntry } from '../../entities/Thread'
import { ThreadRepository } from './ThreadRepository'

/**
 * Test double for `mock` mode.
 *
 * It stores the ENTRIES too, and that is not incidental: with the transcript absorbed into the
 * aggregate (B4, decision 1), the flow tests that run in `mock` (`tests/flows/inbound-routing.flow.test.ts`,
 * `tests/flows/stop-control-plane.flow.test.ts`) write through this repository and read back through
 * it. A separate transcript double would need a store shared with this one through the DI container;
 * one repository makes the two halves the same `Map`.
 */
@injectable()
export class MockThreadRepository extends ThreadRepository {
	private store = new Map<string, Thread>()
	private entries: TranscriptEntry[] = []

	async findById(id: string): Promise<Thread | undefined> {
		return this.store.get(id)
	}

	async findByChannelContact(channelId: string, contactExternalId: string): Promise<Thread | undefined> {
		for (const t of this.store.values()) {
			if (t.channelId === channelId && t.contactRef.externalId === contactExternalId) return t
		}
		return undefined
	}

	async listByOwner(ownerId: string): Promise<Thread[]> {
		return [...this.store.values()].filter(t => t.ownerId === ownerId)
	}

	async save(entity: Thread): Promise<Thread> {
		entity.incrementVersion()
		this.store.set(entity.id.value, entity)
		const { entries } = entity.pullPendingWrites()
		this.entries.push(...entries)
		return entity
	}

	async delete(id: string): Promise<void> {
		this.store.delete(id)
		this.entries = this.entries.filter(e => e.threadId !== id)
	}

	async recentEntries(threadId: string, limit: number): Promise<TranscriptEntry[]> {
		return this.byThreadChronological(threadId).slice(-limit)
	}

	async listEntries(threadId: string): Promise<TranscriptEntry[]> {
		return this.byThreadChronological(threadId)
	}

	async findEntry(entryId: string): Promise<TranscriptEntry | undefined> {
		return this.entries.find(e => e.entryId === entryId)
	}

	private byThreadChronological(threadId: string): TranscriptEntry[] {
		return this.entries.filter(e => e.threadId === threadId).sort((a, b) => a.at.getTime() - b.at.getTime())
	}
}
