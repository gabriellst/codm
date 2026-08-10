// Stop given helper — raises a Stop through the THREAD AGGREGATE + its repository (never the RaiseStop
// use case), so a test about resolution/panels never depends on the raise pipeline being correct.
//
// Since B4 the Stop is a child of `Thread` (spec decision 4), so the helper needs a thread: it nests
// `givenThread` when the caller passes none, which is the documented shape for exactly this.
import type { TestBedLike } from './types'
import { StopKind } from '@codm/contracts-typescript/wire/enums'
import { OPERATOR_ID } from '@auth/operator'
import { ThreadRepository } from '@thread/repositories/ThreadRepository'
import type { Stop } from '@thread/entities/Thread'
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
}>

export async function givenStop(testBed: TestBedLike, overrides: StopOverrides = {}): Promise<Stop> {
	const repo = testBed.resolve(ThreadRepository)
	const ownerId = overrides.ownerId ?? OPERATOR_ID
	const thread = overrides.threadId ? (await repo.findById(overrides.threadId))! : await givenThread(testBed, { ownerId })

	const stop = thread.raiseStop({
		stopId: overrides.stopId,
		issueId: overrides.issueId,
		kind: overrides.kind ?? StopKind.HUMAN_REQUESTED,
		title: overrides.title ?? 'The agent needs you',
		detail: overrides.detail ?? '',
	})
	await repo.save(thread)
	return stop
}
