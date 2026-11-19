import { afterAll, beforeAll, describe, expect, it } from 'bun:test'
import { execFileSync } from 'node:child_process'
import { mkdirSync, mkdtempSync, realpathSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { SystemGitWorktreeProbe } from './SystemGitWorktreeProbe'
import { parseWorktreeList } from './GitWorktreeProbe'

/**
 * The real probe against a real git repository in a temporary folder (fase 4, item 1): the top of a `cwd` deep in a
 * secondary worktree is that worktree, and the list names the main worktree first. No container, no daemon.
 */
describe('SystemGitWorktreeProbe — what git itself answers', () => {
	let root: string
	let repository: string
	let worktree: string
	const git = (cwd: string, ...args: string[]) =>
		execFileSync('git', ['-c', 'user.email=test@example.invalid', '-c', 'user.name=test', ...args], { cwd, stdio: 'pipe' })

	beforeAll(() => {
		root = realpathSync(mkdtempSync(join(tmpdir(), 'codm-worktree-probe-')))
		repository = join(root, 'repo')
		worktree = join(root, 'task-worktree')
		mkdirSync(repository)
		git(repository, 'init', '-q')
		git(repository, 'commit', '-q', '--allow-empty', '-m', 'first')
		git(repository, 'worktree', 'add', '-q', '-b', 'task', worktree)
		mkdirSync(join(worktree, 'deep', 'er'), { recursive: true })
	})
	afterAll(() => {
		rmSync(root, { recursive: true, force: true })
	})

	it('the top of a cwd inside a secondary worktree is that worktree', async () => {
		expect(await new SystemGitWorktreeProbe().topLevel(join(worktree, 'deep', 'er'))).toBe(worktree)
	})

	it('the list names the main worktree first, then the secondary one', async () => {
		expect(await new SystemGitWorktreeProbe().worktrees(repository)).toEqual([
			{ path: repository, main: true, locked: false },
			{ path: worktree, main: false, locked: false },
		])
	})

	it('a folder outside any repository has no top', async () => {
		expect(await new SystemGitWorktreeProbe().topLevel(root)).toBeUndefined()
	})

	it('the porcelain parser reads each block: its path, main first, and a lock with or without a reason', () => {
		const porcelain =
			'worktree /a\nHEAD 1\nbranch refs/heads/main\n\nworktree /b\nHEAD 2\nlocked\n\nworktree /c\nHEAD 3\nlocked kept for review\n\nworktree /d\nHEAD 4\n'
		expect(parseWorktreeList(porcelain)).toEqual([
			{ path: '/a', main: true, locked: false },
			{ path: '/b', main: false, locked: true },
			{ path: '/c', main: false, locked: true },
			{ path: '/d', main: false, locked: false },
		])
	})
})
