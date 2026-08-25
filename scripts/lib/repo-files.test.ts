import { afterAll, beforeAll, describe, expect, it } from 'bun:test'
import { execFileSync } from 'node:child_process'
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { repoFiles } from './repo-files'

/**
 * The property that matters is the one `git ls-files` alone does NOT have: a scanner must see work
 * that is still untracked, because that is the whole window in which an agent is authoring. Friction
 * #55 measured the cost — nine real violations invisible until the first commit.
 *
 * Built on a throwaway git repo rather than this one: the assertion needs a file that is genuinely
 * untracked and one that is genuinely ignored, and manufacturing either inside the real tree would
 * race every other gate in the suite.
 */
describe('repoFiles', () => {
	let root: string

	beforeAll(() => {
		root = mkdtempSync(join(tmpdir(), 'repo-files-'))
		const git = (...args: string[]) => execFileSync('git', args, { cwd: root, encoding: 'utf8' })
		git('init', '-q')
		git('config', 'user.email', 't@t.t')
		git('config', 'user.name', 't')

		writeFileSync(join(root, '.gitignore'), 'ignored.ts\nbuild/\n')
		writeFileSync(join(root, 'tracked.ts'), '// committed\n')
		git('add', '.gitignore', 'tracked.ts')
		git('commit', '-qm', 'init')

		// The three states that must be distinguished.
		writeFileSync(join(root, 'untracked.ts'), '// authored, not yet added\n')
		writeFileSync(join(root, 'ignored.ts'), '// build output\n')
		mkdirSync(join(root, 'build'))
		writeFileSync(join(root, 'build', 'out.ts'), '// build output\n')

		mkdirSync(join(root, 'packages'))
		writeFileSync(join(root, 'packages', 'inside.ts'), '// under a pathspec\n')
	})

	afterAll(() => rmSync(root, { recursive: true, force: true }))

	it('sees tracked files', () => {
		expect(repoFiles(root)).toContain('tracked.ts')
	})

	it('sees UNTRACKED files — the whole point (friction #55)', () => {
		expect(repoFiles(root)).toContain('untracked.ts')
	})

	it('still honors .gitignore, so build output stays out', () => {
		const files = repoFiles(root)
		expect(files).not.toContain('ignored.ts')
		expect(files).not.toContain('build/out.ts')
	})

	it('narrows by pathspec', () => {
		const files = repoFiles(root, ['packages'])
		expect(files).toEqual(['packages/inside.ts'])
	})

	it('returns a sorted, duplicate-free list', () => {
		const files = repoFiles(root)
		expect(files).toEqual([...new Set(files)].sort())
	})
})
