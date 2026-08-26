import { describe, expect, it } from 'bun:test'
import { BaseError } from '@codm/core-typescript'
import { IssueStatus, ProviderKind, IssueArchiveReason } from '@codm/contracts-typescript/wire/enums'
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

	describe('reopen', () => {
		const completed = () => {
			const issue = Issue.open({
				ownerId: '00000000-0000-4000-8000-000000000001',
				threadId: '019e4d24-6524-7041-9e1c-8108180cddae',
				key: 'pix-payment',
				title: 'Pix payment',
				provider: ProviderKind.CLAUDE_CODE,
			})
			issue.complete()
			return issue
		}

		it('leva uma issue concluída de volta para WORKING e zera completedAt', () => {
			const issue = completed()
			expect(issue.status).toBe(IssueStatus.COMPLETED)
			expect(issue.completedAt).toBeDefined()

			issue.reopen()

			expect(issue.status).toBe(IssueStatus.WORKING)
			// Zerado, não apenas ignorado: `AutoArchiveCompletedIssues` seleciona por esta coluna.
			expect(issue.completedAt).toBeUndefined()
		})

		it('recusa uma issue arquivada', () => {
			const issue = completed()
			issue.archive(IssueArchiveReason.MANUAL)
			expect(() => issue.reopen()).toThrow(expect.objectContaining({ name: 'ISSUE_ARCHIVED' }))
		})

		it('recusa uma issue que não está concluída', () => {
			const issue = Issue.open({
				ownerId: '00000000-0000-4000-8000-000000000001',
				threadId: '019e4d24-6524-7041-9e1c-8108180cddae',
				key: 'pix-payment',
				title: 'Pix payment',
				provider: ProviderKind.CLAUDE_CODE,
			})
			expect(issue.status).toBe(IssueStatus.WORKING)
			expect(() => issue.reopen()).toThrow(expect.objectContaining({ name: 'ISSUE_NOT_COMPLETED' }))
		})
	})
})
