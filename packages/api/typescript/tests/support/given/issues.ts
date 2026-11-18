// Issue given helper — sets up an Issue via the repository directly (never the use case).
import type { TestBedLike } from './types'
import { Id } from '@codm/core-typescript'
import { IssueStatus, ProviderKind } from '@codm/contracts-typescript/wire/enums'
import { Issue } from '@issue/entities/Issue'
import { IssueRepository } from '@issue/repositories/IssueRepository'

type IssueOverrides = Partial<{
	ownerId: string
	threadId: string
	key: string
	title: string
	provider: ProviderKind
	status: IssueStatus
	completedAt: Date
	/** Held (fase 2, item 2) — set through the entity's own `pause()`, so the invariants still apply. */
	paused: boolean
	/** The transcript entry the issue was asked from — whose sender is the person its signals are for (fase 3). */
	originEntryId: string
}>

export async function givenIssue(testBed: TestBedLike, overrides: IssueOverrides = {}): Promise<Issue> {
	const repo = testBed.resolve(IssueRepository)
	// Open WORKING first; a COMPLETED request transitions via complete() (open() can't start COMPLETED).
	const wantsCompleted = overrides.status === IssueStatus.COMPLETED || overrides.completedAt !== undefined
	const issue = Issue.open({
		ownerId: overrides.ownerId ?? testBed.ownerId,
		threadId: overrides.threadId ?? Id.value(),
		key: overrides.key ?? `issue-${Id.value().slice(0, 8)}`,
		title: overrides.title ?? 'Test issue',
		provider: overrides.provider ?? ProviderKind.CLAUDE_CODE,
		status: wantsCompleted ? IssueStatus.WORKING : (overrides.status ?? IssueStatus.WORKING),
		originEntryId: overrides.originEntryId,
	})
	if (wantsCompleted) {
		issue.complete()
		if (overrides.completedAt) issue.completedAt = overrides.completedAt
	}
	if (overrides.paused) issue.pause()
	await repo.save(issue)
	return issue
}
