import { injectable } from 'tsyringe-neo'
import { Thread, type Stop, type TranscriptEntry } from '../../entities/Thread'
import { ThreadRepository } from './ThreadRepository'

/**
 * Test double for `mock` mode.
 *
 * It stores the ENTRIES and the STOPS too, and that is not incidental: with both absorbed into the
 * aggregate (B4, decisions 1 and 4), the flow tests that run in `mock` (`tests/flows/inbound-routing.flow.test.ts`,
 * `tests/flows/stop-control-plane.flow.test.ts`) write through this repository and read back through
 * it. A separate transcript/stop double would need a store shared with this one through the DI
 * container; one repository makes the two halves the same `Map`.
 */
@injectable()
export class MockThreadRepository extends ThreadRepository {
	private store = new Map<string, Thread>()
	private entries: TranscriptEntry[] = []
	private stopRows: Stop[] = []

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
		// `stops` aliased to `raised` — the drain key collides with nothing here, but the name mirrors
		// what it is: the stops raised in this unit of work.
		const { entries, stops: raised, stopResolutions } = entity.pullPendingWrites()
		this.entries.push(...entries)
		this.stopRows.push(...raised)
		for (const patch of stopResolutions) {
			const row = this.stopRows.find(s => s.stopId === patch.stopId)
			if (row) {
				row.resolution = patch.resolution
				row.resolvedAt = patch.resolvedAt
			}
		}
		return entity
	}

	async delete(id: string): Promise<void> {
		this.store.delete(id)
		this.entries = this.entries.filter(e => e.threadId !== id)
		this.stopRows = this.stopRows.filter(s => s.threadId !== id)
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

	async findStop(stopId: string): Promise<Stop | undefined> {
		return this.stopRows.find(s => s.stopId === stopId)
	}

	async openStops(threadId: string): Promise<Stop[]> {
		return this.stopRows.filter(s => s.threadId === threadId && !s.resolvedAt)
	}

	async openStopsByIssue(issueId: string): Promise<Stop[]> {
		return this.stopRows.filter(s => s.issueId === issueId && !s.resolvedAt)
	}

	private byThreadChronological(threadId: string): TranscriptEntry[] {
		return this.entries.filter(e => e.threadId === threadId).sort((a, b) => a.at.getTime() - b.at.getTime())
	}
}
