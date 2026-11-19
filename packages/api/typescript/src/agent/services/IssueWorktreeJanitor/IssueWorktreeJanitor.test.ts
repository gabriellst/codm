import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from 'bun:test'
import { container, type DependencyContainer } from 'tsyringe-neo'
import { execFileSync } from 'node:child_process'
import { existsSync, mkdirSync, mkdtempSync, realpathSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { uuidv7 } from 'uuidv7'
import { DomainEventRepository } from '@codm/core-typescript'
import { MailboxClaimClass, MailboxItemKind, MailboxTargetKind, PermissionPosture } from '@codm/contracts-typescript/wire/enums'
import { TestBed } from '@test/support'
import { MOCK_CLOUD_OWNER_ID } from '@shared/services/CloudSession/MockCloudSession'
import { ISSUE_ATTRIBUTE_DEFAULTS, IssueAttributes } from '../../entities/IssueAttributes'
import { IssueAttributesRepository } from '../../repositories/IssueAttributesRepository'
import { MailboxRepository } from '../../repositories/MailboxRepository'
import { AgentWorktreeRemovedEvent } from '../../events/AgentWorktreeRemovedEvent'
import { GitWorktreeProbe, SystemGitWorktreeProbe } from '../GitWorktreeProbe'
import { IssueWorktreeJanitor, WORKTREE_CLEANUP_AFTER_MS } from './IssueWorktreeJanitor'

/**
 * THE WORKTREE JANITOR AGAINST REAL GIT (fase 4, item 1 — decisão do dono, 19/11), in a repository this test creates
 * in a temporary folder — never a real workspace. It removes the worktree of a task closed for more than seven days
 * that is registered and clean, and keeps the branch; it NEVER removes one with an uncommitted change, an untracked
 * file, a lock, a task reopened after closing, a task still open sharing it, a task closed less than seven days ago,
 * a task with no registration, nor the main worktree.
 *
 * Falsifier: drop any one guard (the status check, the lock, the reopening, the sharing, the age) and its case below
 * deletes a folder that must survive.
 */
describe('IssueWorktreeJanitor — only a registered, clean worktree of a task closed for a week goes', () => {
	let testBed: TestBed
	let testContainer: DependencyContainer
	let root: string
	let repository: string

	const git = (cwd: string, ...args: string[]) =>
		execFileSync('git', ['-c', 'user.email=test@example.invalid', '-c', 'user.name=test', ...args], { cwd, stdio: 'pipe' }).toString()

	beforeAll(async () => {
		testContainer = container.createChildContainer()
		testBed = await TestBed.create('integration', { testContainer, ownerId: MOCK_CLOUD_OWNER_ID })
		// The ONE place real git is bound: this suite's temporary repository.
		testBed.override(GitWorktreeProbe, new SystemGitWorktreeProbe())
	})
	beforeEach(async () => {
		await testBed.reset()
		root = realpathSync(mkdtempSync(join(tmpdir(), 'codm-worktree-janitor-')))
		repository = join(root, 'repo')
		mkdirSync(repository)
		git(repository, 'init', '-q', '-b', 'main')
		writeFileSync(join(repository, 'README'), 'base\n')
		git(repository, 'add', 'README')
		git(repository, 'commit', '-q', '-m', 'first')
	})
	afterEach(() => {
		rmSync(root, { recursive: true, force: true })
	})
	afterAll(async () => {
		await testBed.destroy()
	})

	const DAY = 24 * 60 * 60 * 1000
	const NOW = new Date()

	/** A secondary worktree of the test repository, on its own branch, with one committed file. */
	const worktree = (name: string) => {
		const path = join(root, name)
		git(repository, 'worktree', 'add', '-q', '-b', `task-${name}`, path)
		writeFileSync(join(path, 'work.txt'), 'done\n')
		git(path, 'add', 'work.txt')
		git(path, 'commit', '-q', '-m', 'work')
		return path
	}

	/** A task's attributes: born, optionally with the worktree registered and closed `closedDaysAgo` days ago. */
	const task = async (worktreePath: string | undefined, closedDaysAgo: number | undefined) => {
		const attributes = IssueAttributes.born({
			issueId: uuidv7(),
			ownerId: MOCK_CLOUD_OWNER_ID,
			threadId: uuidv7(),
			...ISSUE_ATTRIBUTE_DEFAULTS,
		})
		if (worktreePath) attributes.registerWorktree(worktreePath, new Date(NOW.getTime() - 20 * DAY))
		if (closedDaysAgo !== undefined) attributes.close(new Date(NOW.getTime() - closedDaysAgo * DAY))
		const repo = testBed.resolve(IssueAttributesRepository)
		await repo.insertIfNew(attributes)
		await repo.save(attributes)
		return attributes
	}

	const sweep = () => testBed.resolve(IssueWorktreeJanitor).sweep(NOW)
	const removedFacts = () => testBed.resolve(DomainEventRepository).findByType(AgentWorktreeRemovedEvent)

	it('removes the clean worktree of a task closed eight days ago — the branch and its commit stay', async () => {
		const path = worktree('closed')
		const closed = await task(path, 8)

		expect(await sweep()).toEqual({ removed: 1, kept: 0 })

		expect(existsSync(path)).toBe(false)
		expect(git(repository, 'branch', '--list', 'task-closed')).toContain('task-closed')
		expect(git(repository, 'log', '--oneline', 'task-closed')).toContain('work')
		expect((await testBed.resolve(IssueAttributesRepository).findByIssueId(closed.issueId))?.worktreePath).toBeUndefined()
		const facts = await removedFacts()
		expect(facts.map(fact => fact.payload)).toEqual([{ issueId: closed.issueId, freedBytes: expect.any(Number) }])
		// a second sweep has nothing left to do
		expect(await sweep()).toEqual({ removed: 0, kept: 0 })
	})

	it('keeps a worktree with an uncommitted change', async () => {
		const path = worktree('dirty')
		writeFileSync(join(path, 'work.txt'), 'changed\n')
		await task(path, 8)
		expect(await sweep()).toEqual({ removed: 0, kept: 1 })
		expect(existsSync(join(path, 'work.txt'))).toBe(true)
	})

	it('keeps a worktree with an untracked file', async () => {
		const path = worktree('untracked')
		writeFileSync(join(path, 'notes.txt'), 'not committed\n')
		await task(path, 8)
		expect(await sweep()).toEqual({ removed: 0, kept: 1 })
		expect(existsSync(join(path, 'notes.txt'))).toBe(true)
	})

	it('keeps a locked worktree', async () => {
		const path = worktree('locked')
		git(repository, 'worktree', 'lock', '--reason', 'kept for review', path)
		await task(path, 8)
		expect(await sweep()).toEqual({ removed: 0, kept: 1 })
		expect(existsSync(path)).toBe(true)
	})

	it('keeps the worktree of a task REOPENED after closing (an item queued after the closing)', async () => {
		const path = worktree('reopened')
		const reopened = await task(path, 8)
		await testBed.resolve(MailboxRepository).enqueue({
			ownerId: MOCK_CLOUD_OWNER_ID,
			targetKind: MailboxTargetKind.ISSUE,
			targetId: reopened.issueId,
			kind: MailboxItemKind.STEER,
			claimClass: MailboxClaimClass.STEER,
			posture: PermissionPosture.AUTO,
			payload: { threadId: reopened.threadId },
			dedupKey: `steer:${uuidv7()}`,
		})
		expect(await sweep()).toEqual({ removed: 0, kept: 0 })
		expect(existsSync(path)).toBe(true)
	})

	it('keeps a worktree an OPEN task also registered', async () => {
		const path = worktree('shared')
		await task(path, 8)
		await task(path, undefined)
		expect(await sweep()).toEqual({ removed: 0, kept: 0 })
		expect(existsSync(path)).toBe(true)
	})

	it('keeps a worktree another task registered and closed only recently', async () => {
		const path = worktree('shared-recent')
		await task(path, 8)
		await task(path, 1)
		expect(await sweep()).toEqual({ removed: 0, kept: 0 })
		expect(existsSync(path)).toBe(true)
	})

	it('keeps a worktree another task registered and REOPENED after closing', async () => {
		const path = worktree('shared-reopened')
		await task(path, 9)
		const reopened = await task(path, 8)
		await testBed.resolve(MailboxRepository).enqueue({
			ownerId: MOCK_CLOUD_OWNER_ID,
			targetKind: MailboxTargetKind.ISSUE,
			targetId: reopened.issueId,
			kind: MailboxItemKind.STEER,
			claimClass: MailboxClaimClass.STEER,
			posture: PermissionPosture.AUTO,
			payload: { threadId: reopened.threadId },
			dedupKey: `steer:${uuidv7()}`,
		})
		expect(await sweep()).toEqual({ removed: 0, kept: 0 })
		expect(existsSync(path)).toBe(true)
	})

	it('keeps the worktree of a task closed less than seven days ago', async () => {
		const path = worktree('recent')
		await task(path, (WORKTREE_CLEANUP_AFTER_MS - DAY) / DAY)
		expect(await sweep()).toEqual({ removed: 0, kept: 0 })
		expect(existsSync(path)).toBe(true)
	})

	it('never touches a worktree no task registered', async () => {
		const path = worktree('unregistered')
		await task(undefined, 30)
		expect(await sweep()).toEqual({ removed: 0, kept: 0 })
		expect(existsSync(path)).toBe(true)
	})

	it('never removes the main worktree, even registered by mistake', async () => {
		await task(repository, 8)
		expect(await sweep()).toEqual({ removed: 0, kept: 1 })
		expect(existsSync(join(repository, 'README'))).toBe(true)
	})
})
