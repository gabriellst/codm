import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'bun:test'
import { container, type DependencyContainer } from 'tsyringe-neo'
import { TestBed, givenThread, givenWorkspace } from '@test/support'
import { MOCK_CLOUD_OWNER_ID } from '@shared/services/CloudSession/MockCloudSession'
import { IssueAttributesRepository } from '../repositories/IssueAttributesRepository'
import { ISSUE_ATTRIBUTE_DEFAULTS, IssueAttributes } from '../entities/IssueAttributes'
import { GitWorktreeProbe, MockGitWorktreeProbe } from '../services/GitWorktreeProbe'
import { RecordIssueWorktree } from './RecordIssueWorktree'

/**
 * REGISTERING A TASK'S WORKTREE (fase 4, item 1) — by asking git, never by reading a folder name. Only a secondary
 * worktree of the task's OWN workspace is registered: the main worktree, a path outside any repository and a
 * worktree of another repository register nothing, because the janitor (S3) may later remove what is registered.
 *
 * Falsifier: drop the `!worktree.main` filter and the main-worktree case registers the workspace itself.
 */
describe('RecordIssueWorktree — only a secondary worktree of the workspace is registered', () => {
	let testBed: TestBed
	let testContainer: DependencyContainer

	beforeAll(async () => {
		testContainer = container.createChildContainer()
		testBed = await TestBed.create('integration', { testContainer, ownerId: MOCK_CLOUD_OWNER_ID })
	})
	beforeEach(async () => {
		await testBed.reset()
	})
	afterAll(async () => {
		await testBed.destroy()
	})

	const scriptedGit = (): MockGitWorktreeProbe => {
		const probe = testBed.resolve(GitWorktreeProbe)
		if (!(probe instanceof MockGitWorktreeProbe)) throw new Error('integration must bind the scripted git probe')
		return probe
	}

	/** A task on a workspace whose repository lists the main worktree and one secondary worktree. */
	async function scene() {
		const path = `/Users/dev/project-${crypto.randomUUID()}`
		const workspace = await givenWorkspace(testBed, { ownerId: MOCK_CLOUD_OWNER_ID, path })
		const thread = await givenThread(testBed, { ownerId: MOCK_CLOUD_OWNER_ID, workspaceId: workspace.id.value })
		const issueId = crypto.randomUUID()
		await testBed.resolve(IssueAttributesRepository).insertIfNew(
			IssueAttributes.born({
				issueId,
				ownerId: MOCK_CLOUD_OWNER_ID,
				threadId: thread.id.value,
				...ISSUE_ATTRIBUTE_DEFAULTS,
			}),
		)
		const worktree = `${path}/.wt/task`
		scriptedGit().scriptWorktrees(path, [
			{ path, main: true, locked: false },
			{ path: worktree, main: false, locked: false },
		])
		return { issueId, threadId: thread.id.value, path, worktree }
	}
	const record = (issueId: string, threadId: string, cwd: string) =>
		testBed.resolve(RecordIssueWorktree).execute({ issueId, threadId, cwd, seenAt: new Date('2026-11-19T12:00:00Z') })
	const worktreeOf = async (issueId: string) => (await testBed.resolve(IssueAttributesRepository).findByIssueId(issueId))?.worktreePath

	it('a cwd inside a secondary worktree of the workspace registers the TOP of that worktree, with when it was seen', async () => {
		const { issueId, threadId, worktree } = await scene()
		scriptedGit().scriptTopLevel(`${worktree}/packages/app`, worktree)

		expect(await record(issueId, threadId, `${worktree}/packages/app`)).toEqual({ registered: true, worktreePath: worktree })
		const row = await testBed.resolve(IssueAttributesRepository).findByIssueId(issueId)
		expect(row?.worktreePath).toBe(worktree)
		expect(row?.worktreeSeenAt).toEqual(new Date('2026-11-19T12:00:00Z'))
	})

	it('a cwd in the MAIN worktree registers nothing', async () => {
		const { issueId, threadId, path } = await scene()
		scriptedGit().scriptTopLevel(`${path}/src`, path)

		expect(await record(issueId, threadId, `${path}/src`)).toEqual({ registered: false })
		expect(await worktreeOf(issueId)).toBeUndefined()
	})

	it('a cwd outside any repository registers nothing', async () => {
		const { issueId, threadId } = await scene()

		expect(await record(issueId, threadId, '/tmp/elsewhere')).toEqual({ registered: false })
		expect(await worktreeOf(issueId)).toBeUndefined()
	})

	it('a worktree of ANOTHER repository registers nothing — even when its folder looks like a task worktree', async () => {
		const { issueId, threadId } = await scene()
		const foreign = '/Users/dev/other-project/.wt/task'
		scriptedGit().scriptTopLevel(foreign, foreign)

		expect(await record(issueId, threadId, foreign)).toEqual({ registered: false })
		expect(await worktreeOf(issueId)).toBeUndefined()
	})

	it('a task with no attributes row has nothing to stamp', async () => {
		const { threadId, worktree } = await scene()
		scriptedGit().scriptTopLevel(worktree, worktree)

		expect(await record(crypto.randomUUID(), threadId, worktree)).toEqual({ registered: false })
	})
})
