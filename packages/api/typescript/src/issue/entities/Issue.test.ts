import { describe, expect, it } from 'bun:test'
import { BaseError } from '@template/core-typescript'
import { IssueStatus, ProviderKind, IssueArchiveReason } from '@template/contracts-typescript/wire/enums'
import { Issue } from './Issue'

const base = {
	ownerId: '00000000-0000-4000-8000-000000000001',
	threadId: '00000000-0000-4000-8000-0000000000aa',
	key: 'coupon-fix',
	title: 'Fix the coupon',
	provider: ProviderKind.CLAUDE_CODE,
}

describe('Issue entity', () => {
	it('opens WORKING, not archived, not completed', () => {
		const i = Issue.open(base)
		expect(i.status).toBe(IssueStatus.WORKING)
		expect(i.archived).toBe(false)
		expect(i.completedAt).toBeUndefined()
	})

	it('complete() stamps COMPLETED + completedAt', () => {
		const i = Issue.open(base)
		i.complete('PR #214')
		expect(i.status).toBe(IssueStatus.COMPLETED)
		expect(i.completedAt).toBeInstanceOf(Date)
		expect(i.meta).toBe('PR #214')
	})

	it('complete() twice throws ISSUE_ALREADY_COMPLETED', () => {
		const i = Issue.open(base)
		i.complete()
		expect(() => i.complete()).toThrow(BaseError)
	})

	it('archive() then archive() throws ISSUE_ALREADY_ARCHIVED', () => {
		const i = Issue.open(base)
		i.archive(IssueArchiveReason.MANUAL)
		expect(i.archived).toBe(true)
		expect(i.archiveReason).toBe(IssueArchiveReason.MANUAL)
		expect(() => i.archive(IssueArchiveReason.MANUAL)).toThrow(BaseError)
	})

	it('restore() on a non-archived issue throws ISSUE_NOT_ARCHIVED', () => {
		const i = Issue.open(base)
		expect(() => i.restore()).toThrow(BaseError)
	})

	it('archive() then restore() clears the archive', () => {
		const i = Issue.open(base)
		i.archive(IssueArchiveReason.AUTO_24H)
		i.restore()
		expect(i.archived).toBe(false)
		expect(i.archiveReason).toBeUndefined()
	})

	it('assertNotArchived throws ISSUE_ARCHIVED once archived', () => {
		const i = Issue.open(base)
		i.archive(IssueArchiveReason.MANUAL)
		expect(() => i.assertNotArchived()).toThrow(BaseError)
	})
})
