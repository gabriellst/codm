// Stop given helper — raises a Stop through the THREAD AGGREGATE + its repository (never the RaiseStop
// use case), so a test about resolution/panels never depends on the raise pipeline being correct.
//
// Since B4 the Stop is a child of `Thread` (spec decision 4), so the helper needs a thread: it nests
// `givenThread` when the caller passes none, which is the documented shape for exactly this.
import type { TestBedLike } from './types'
import { uuidv7 } from 'uuidv7'
import { StopKind, TranscriptKind } from '@codm/contracts-typescript/wire/enums'
import { ThreadRepository } from '@thread/repositories/ThreadRepository'
import type { Stop } from '@thread/entities/Thread'
import { StopAsk, type StopAskProps } from '@thread/objects/StopAsk'
import { givenThread } from './threads'

type StopOverrides = Partial<{
	stopId: string
	ownerId: string
	/** Left undefined on purpose by the tests that exercise a THREAD-LEVEL stop (B4, US-5). */
	issueId: string
	threadId: string
	kind: StopKind
	title: string
	detail: string
	/**
	 * Raise an ASK (fase 3) instead of a plain kind — the `StopAsk` value object derives the kind (`kind` is
	 * then ignored). `seq` is read from the repository like `RaiseStop` does, unless given.
	 */
	ask: StopAskProps
	seq: number
	/**
	 * Also record the group message that put the ask (or the stop's notice) — a SYSTEM entry on the issue
	 * carrying the stop's id, which the stop points back at (`askEntryId`) — the anchor a quoted reply
	 * resolves. The text is the caller's; returned as `stop.askEntryId` (and found by `findEntry`).
	 */
	notice: string
}>

export async function givenStop(testBed: TestBedLike, overrides: StopOverrides = {}): Promise<Stop> {
	const repo = testBed.resolve(ThreadRepository)
	const ownerId = overrides.ownerId ?? testBed.ownerId
	const thread = overrides.threadId ? (await repo.findById(overrides.threadId))! : await givenThread(testBed, { ownerId })

	const stopId = overrides.stopId ?? uuidv7()
	const notice =
		overrides.notice === undefined
			? undefined
			: thread.recordEntry({ kind: TranscriptKind.SYSTEM, text: overrides.notice, issueId: overrides.issueId, stopId })
	const common = {
		stopId,
		issueId: overrides.issueId,
		title: overrides.title ?? 'The agent needs you',
		detail: overrides.detail ?? '',
	}
	const stop = overrides.ask
		? thread.raiseStop({
				...common,
				ask: new StopAsk(overrides.ask),
				seq: overrides.seq ?? (overrides.issueId ? await repo.nextAskSeq(overrides.issueId) : undefined),
				askEntryId: notice?.entryId,
			})
		: thread.raiseStop({ ...common, kind: overrides.kind ?? StopKind.HUMAN_REQUESTED })
	await repo.save(thread)
	return stop
}
