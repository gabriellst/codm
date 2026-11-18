import { injectable } from 'tsyringe-neo'
import { BaseError } from '@codm/core-typescript'
import { OutputRouting, StopKind } from '@codm/contracts-typescript/wire/enums'
import { Thread, type Stop, type TranscriptEntry } from '../../entities/Thread'
import { askDueAt } from '../../objects/StopAsk'
import type { DomainErrors } from '../../errors'
import { ThreadRepository, type OverdueDigest } from './ThreadRepository'

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
		// `stops` aliased to `raised` — the drain key collides with nothing here, but the name mirrors
		// what it is: the stops raised in this unit of work.
		const { entries, stops: raised, stopResolutions, entryLinks, digestPatches } = entity.pullPendingWrites()
		// The first resolution wins, as in `LibSqlThreadRepository.save` — and the refusal comes BEFORE any
		// write, because this double has no transaction to roll back.
		const lost = stopResolutions.find(patch => this.stopRows.find(s => s.stopId === patch.stopId)?.resolvedAt)
		if (lost) throw new BaseError<DomainErrors>('STOP_ALREADY_RESOLVED', `stop ${lost.stopId} was resolved by someone else first`)
		const flushed = digestPatches.find(patch => {
			const row = this.entries.find(e => e.entryId === patch.entryId)
			return !row || row.routing !== OutputRouting.DIGEST || row.digestEntryId
		})
		if (flushed) throw new BaseError<DomainErrors>('SIGNAL_ALREADY_FLUSHED', `entry ${flushed.entryId} was flushed by someone else first`)
		entity.incrementVersion()
		this.store.set(entity.id.value, entity)
		this.entries.push(...entries)
		this.stopRows.push(...raised)
		for (const patch of stopResolutions) {
			const row = this.stopRows.find(s => s.stopId === patch.stopId)
			if (row) {
				row.resolution = patch.resolution
				row.resolvedAt = patch.resolvedAt
				row.answer = patch.answer
				row.answeredBy = patch.answeredBy
			}
		}
		for (const patch of digestPatches) {
			const row = this.entries.find(e => e.entryId === patch.entryId)
			if (row) {
				row.routing = patch.routing
				row.digestEntryId = patch.digestEntryId
			}
		}
		for (const link of entryLinks) {
			const row = this.entries.find(e => e.entryId === link.entryId)
			if (row && !row.issueId) {
				row.issueId = link.issueId
				row.classification = link.classification
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

	async nextAskSeq(issueId: string): Promise<number> {
		return Math.max(0, ...this.stopRows.filter(s => s.issueId === issueId).map(s => s.seq ?? 0)) + 1
	}

	async markAskDelivered(entryId: string, deliveredAt: Date): Promise<string[]> {
		const carried = new Set([entryId, ...this.entries.filter(e => e.digestEntryId === entryId).map(e => e.entryId)])
		const marked = this.stopRows.filter(
			s => s.kind === StopKind.QUESTION_ASKED && !s.resolvedAt && !s.dueAt && s.askEntryId !== undefined && carried.has(s.askEntryId),
		)
		for (const stop of marked) stop.dueAt = askDueAt(deliveredAt)
		return marked.map(s => s.stopId)
	}

	async findDueAsks(now: Date): Promise<Stop[]> {
		return this.stopRows
			.filter(s => s.kind === StopKind.QUESTION_ASKED && !s.resolvedAt && s.dueAt && s.dueAt.getTime() <= now.getTime())
			.sort((a, b) => (a.dueAt?.getTime() ?? 0) - (b.dueAt?.getTime() ?? 0))
	}

	async findAsk(issueId: string, seq: number): Promise<Stop | undefined> {
		return this.stopRows.find(s => s.issueId === issueId && s.seq === seq)
	}

	async stopsCarriedBy(entryId: string): Promise<Stop[]> {
		const own = this.entries.find(e => e.entryId === entryId)?.stopId
		const carried = new Set([entryId, ...this.entries.filter(e => e.digestEntryId === entryId).map(e => e.entryId)])
		return this.stopRows
			.filter(s => s.stopId === own || (s.askEntryId !== undefined && carried.has(s.askEntryId)))
			.sort((a, b) => a.raisedAt.getTime() - b.raisedAt.getTime())
	}

	async pendingDigest(threadId: string, addresseeId: string | undefined): Promise<TranscriptEntry[]> {
		return this.byThreadChronological(threadId).filter(
			e => e.routing === OutputRouting.DIGEST && !e.digestEntryId && e.addresseeId === addresseeId,
		)
	}

	async overdueDigests(cutoff: Date): Promise<OverdueDigest[]> {
		const seen = new Map<string, OverdueDigest>()
		for (const e of this.entries) {
			if (e.routing !== OutputRouting.DIGEST || e.digestEntryId || e.at.getTime() > cutoff.getTime()) continue
			seen.set(`${e.threadId}:${e.addresseeId ?? ''}`, { ownerId: e.ownerId, threadId: e.threadId, addresseeId: e.addresseeId })
		}
		return [...seen.values()]
	}

	private byThreadChronological(threadId: string): TranscriptEntry[] {
		return this.entries.filter(e => e.threadId === threadId).sort((a, b) => a.at.getTime() - b.at.getTime())
	}
}
