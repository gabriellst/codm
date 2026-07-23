// Stop given helper — raises a Stop row via the repository directly (never the RaiseStop use case),
// so a test about resolution/panels never depends on the raise pipeline being correct.
import type { TestBed } from '../TestBed'
import { Id } from '@codedm/core-typescript'
import { StopKind } from '@codedm/contracts-typescript/wire/enums'
import { OPERATOR_ID } from '@auth/operator'
import { StopRepository, type RaiseStopInput, type StopRow } from '@issue/repositories/StopRepository/StopRepository'

type StopOverrides = Partial<RaiseStopInput>

export async function givenStop(testBed: TestBed, overrides: StopOverrides = {}): Promise<StopRow> {
	const repo = testBed.resolve(StopRepository)
	return repo.raise({
		stopId: overrides.stopId ?? Id.value(),
		ownerId: overrides.ownerId ?? OPERATOR_ID,
		issueId: overrides.issueId ?? Id.value(),
		threadId: overrides.threadId ?? Id.value(),
		kind: overrides.kind ?? StopKind.HUMAN_REQUESTED,
		title: overrides.title ?? 'The agent needs you',
		detail: overrides.detail ?? '',
	})
}
