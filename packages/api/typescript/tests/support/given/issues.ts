// Issue given helper — sets up an Issue via the repository directly (never the use case).
import type { TestBedLike } from './types'
import { Id } from '@codm/core-typescript'
import { IssueStatus, ProviderKind } from '@codm/contracts-typescript/wire/enums'
import { OPERATOR_ID } from '@auth/operator'
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
}>

export async function givenIssue(testBed: TestBedLike, overrides: IssueOverrides = {}): Promise<Issue> {
	const repo = testBed.resolve(IssueRepository)
	// Open WORKING first; a COMPLETED request transitions via complete() (open() can't start COMPLETED).
	const wantsCompleted = overrides.status === IssueStatus.COMPLETED || overrides.completedAt !== undefined
	const issue = Issue.open({
		ownerId: overrides.ownerId ?? OPERATOR_ID,
		threadId: overrides.threadId ?? Id.value(),
		key: overrides.key ?? `issue-${Id.value().slice(0, 8)}`,
		title: overrides.title ?? 'Test issue',
		provider: overrides.provider ?? ProviderKind.CLAUDE_CODE,
		status: wantsCompleted ? IssueStatus.WORKING : (overrides.status ?? IssueStatus.WORKING),
	})
	if (wantsCompleted) {
		issue.complete()
		if (overrides.completedAt) issue.completedAt = overrides.completedAt
	}
	await repo.save(issue)
	return issue
}
