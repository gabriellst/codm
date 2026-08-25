/**
 * merge-regenerate.test.ts — AC-10: a synthetic conflict under `packages/client/dist/` is
 * resolved by the `regenerate` driver, and `.gitattributes` declares BOTH generated roots.
 *
 * The falsifier is run in both directions inside one fixture: the same merge WITHOUT the driver
 * wired must conflict (so we know the test can fail), and WITH it must complete clean.
 */

import { afterAll, beforeAll, describe, expect, it } from 'bun:test'
import { execFileSync } from 'node:child_process'
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join, resolve } from 'node:path'
import { DRIVER_CONFIG_COMMAND, GENERATED_ROOTS, resolveGenerated } from './merge-regenerate'

const REPO_ROOT = resolve(import.meta.dir, '..', '..')
const DRIVER = join(REPO_ROOT, 'scripts/sync/merge-regenerate.ts')
const GENERATED_FILE = 'packages/client/dist/typescript/src/generated.ts'

let root: string

function git(repo: string, ...args: string[]): string {
	return execFileSync('git', ['-c', 'user.name=fixture', '-c', 'user.email=fixture@test', '-C', repo, ...args], {
		encoding: 'utf8',
		stdio: ['ignore', 'pipe', 'pipe'],
	}).trim()
}

/** Runs a merge and reports git's exit code instead of throwing — the code IS the assertion. */
function tryMerge(repo: string, branch: string): number {
	try {
		git(repo, 'merge', '--no-edit', branch)
		return 0
	} catch (err) {
		return typeof (err as { status?: number }).status === 'number' ? ((err as { status: number }).status ?? 1) : 1
	}
}

function write(repo: string, rel: string, content: string): void {
	const file = join(repo, rel)
	mkdirSync(dirname(file), { recursive: true })
	writeFileSync(file, content)
}

/** A repo whose two branches changed the SAME generated file — the shape of every real case. */
function divergentRepo(withDriver: boolean): string {
	const repo = mkdtempSync(join(root, 'merge-'))
	git(repo, 'init', '-q', '-b', 'main')
	write(repo, '.gitattributes', readFileSync(join(REPO_ROOT, '.gitattributes'), 'utf8'))
	write(repo, GENERATED_FILE, 'export const generated = "base"\n')
	git(repo, 'add', '-A')
	git(repo, 'commit', '-qm', 'base')

	if (withDriver) git(repo, 'config', 'merge.regenerate.driver', `bun ${DRIVER} %O %A %B %P`)

	git(repo, 'checkout', '-q', '-b', 'feature')
	write(repo, GENERATED_FILE, 'export const generated = "regenerated from the feature controllers"\n')
	git(repo, 'add', '-A')
	git(repo, 'commit', '-qm', 'regen on feature')

	git(repo, 'checkout', '-q', 'main')
	write(repo, GENERATED_FILE, 'export const generated = "regenerated from main controllers"\n')
	git(repo, 'add', '-A')
	git(repo, 'commit', '-qm', 'regen on main')
	return repo
}

beforeAll(() => {
	root = mkdtempSync(join(tmpdir(), 'merge-regen-'))
})
afterAll(() => rmSync(root, { recursive: true, force: true }))

describe('merge driver regenerate (AC-10)', () => {
	it('.gitattributes declara AS DUAS raízes geradas, com o driver', () => {
		const attributes = readFileSync(join(REPO_ROOT, '.gitattributes'), 'utf8')
		for (const generatedRoot of GENERATED_ROOTS) {
			expect(attributes, `${generatedRoot} must be declared`).toContain(`${generatedRoot}/**`)
		}
		const declared = attributes.split('\n').filter(line => line.includes('merge=regenerate') && !line.trimStart().startsWith('#'))
		expect(declared, 'exactly the two roots — no more, no fewer').toHaveLength(GENERATED_ROOTS.length)
		// The file cannot declare the executable; the config line is the other required half.
		expect(attributes).toContain(DRIVER_CONFIG_COMMAND.replace('git config ', '').split(' ')[0])
	})

	it('SEM o driver o mesmo merge CONFLITA — o falseador que prova que o teste sabe falhar', () => {
		const repo = divergentRepo(false)
		expect(tryMerge(repo, 'feature'), 'git stops on a conflict').not.toBe(0)
		const merged = readFileSync(join(repo, GENERATED_FILE), 'utf8')
		expect(merged).toContain('<<<<<<<')
		expect(merged).toContain('=======')
		expect(merged).toContain('>>>>>>>')
	})

	it('COM o driver o merge fecha limpo, sem marcador, ficando com ours', () => {
		const repo = divergentRepo(true)
		expect(tryMerge(repo, 'feature'), 'the merge completes').toBe(0)
		const merged = readFileSync(join(repo, GENERATED_FILE), 'utf8')
		expect(merged).toBe('export const generated = "regenerated from main controllers"\n')
		expect(merged).not.toContain('<<<<<<<')
		expect(git(repo, 'status', '--porcelain'), 'nothing left unmerged').toBe('')
	})

	it('sem um lado ours não inventa arquivo — devolve o conflito ao git', () => {
		const lines: string[] = []
		const code = resolveGenerated({ ancestor: '/nope/O', ours: '/nope/A', theirs: '/nope/B', pathname: GENERATED_FILE }, line =>
			lines.push(line),
		)
		expect(code).toBe(1)
		expect(lines.join('\n')).toContain('leaving the conflict for git')
	})

	it('a mensagem aponta para quem É a autoridade sobre os bytes: check:generated', () => {
		const lines: string[] = []
		const ours = join(root, 'ours.ts')
		writeFileSync(ours, 'x\n')
		expect(resolveGenerated({ ancestor: ours, ours, theirs: ours, pathname: GENERATED_FILE }, l => lines.push(l))).toBe(0)
		expect(lines.join('\n')).toContain('bun check:generated')
	})
})
