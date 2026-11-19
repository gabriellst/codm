import { afterAll, beforeAll, describe, expect, it } from 'bun:test'
import { chmod, mkdtemp, readFile, rm, stat, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { PublishRunOutcome } from '@codm/contracts-typescript/wire/enums'
import { ProcessPublishCommandRunner, publishCommandEnv } from './ProcessPublishCommandRunner'

/**
 * THE REAL RUNNER (fase 4, item 6c) — against executables this test writes into a fresh temp directory, never a real
 * workspace: argv reaches the program literally (no shell), `cwd` is honoured, a non-zero exit is FAILED, the
 * deadline kills the process GROUP (a child it started included), and the daemon's secrets stay out of its env.
 *
 * Falsifier: `shell: true` and the `;` argument runs `touch`; drop `detached` + the group kill and the grandchild
 * writes its file after the deadline; pass `process.env` through and `CODM_*` reaches the command.
 */
describe('ProcessPublishCommandRunner', () => {
	let dir: string
	const runner = new ProcessPublishCommandRunner()

	const script = async (name: string, body: string): Promise<string> => {
		const path = join(dir, name)
		await writeFile(path, `#!/bin/sh\n${body}\n`)
		await chmod(path, 0o755)
		return path
	}
	const exists = (path: string) =>
		stat(path).then(
			() => true,
			() => false,
		)

	beforeAll(async () => {
		dir = await mkdtemp(join(tmpdir(), 'codm-publish-'))
	})
	afterAll(async () => {
		await rm(dir, { recursive: true, force: true })
	})

	it('each argument arrives literally — `;` and `$()` are text, never shell', async () => {
		const echo = await script('args.sh', 'for a in "$@"; do printf "[%s]\\n" "$a"; done')
		const result = await runner.run({ argv: [echo, `a; touch ${dir}/pwned`, '$(touch x)', 'two words'], cwd: dir, timeoutMs: 10_000 })
		expect(result.outcome).toBe(PublishRunOutcome.SUCCEEDED)
		expect(result.exitCode).toBe(0)
		expect(result.output).toBe(`[a; touch ${dir}/pwned]\n[$(touch x)]\n[two words]\n`)
		expect(await exists(join(dir, 'pwned'))).toBe(false)
	})

	it('runs in the cwd it was given', async () => {
		const where = await script('where.sh', 'pwd')
		const result = await runner.run({ argv: [where], cwd: dir, timeoutMs: 10_000 })
		// macOS resolves the temp dir through /private — compare the real path's tail.
		expect(result.output.trim().endsWith(dir.split('/').at(-1) ?? '')).toBe(true)
	})

	it('a non-zero exit is FAILED with its code, and the output keeps stderr', async () => {
		const fail = await script('fail.sh', 'echo building; echo "boom" 1>&2; exit 3')
		const result = await runner.run({ argv: [fail], cwd: dir, timeoutMs: 10_000 })
		expect(result).toMatchObject({ outcome: PublishRunOutcome.FAILED, exitCode: 3 })
		expect(result.output).toContain('boom')
	})

	it('an executable that does not exist is FAILED — an outcome, never a throw', async () => {
		const result = await runner.run({ argv: [join(dir, 'missing')], cwd: dir, timeoutMs: 10_000 })
		expect(result.outcome).toBe(PublishRunOutcome.FAILED)
		expect(result.exitCode).toBeUndefined()
	})

	it('past the deadline: TIMED_OUT, and the whole process group dies — a child it started never finishes', async () => {
		const late = join(dir, 'late')
		const slow = await script('slow.sh', `(sleep 1; touch ${late}) &\nsleep 5`)
		const result = await runner.run({ argv: [slow], cwd: dir, timeoutMs: 200 })
		expect(result.outcome).toBe(PublishRunOutcome.TIMED_OUT)
		await Bun.sleep(1500)
		expect(await exists(late)).toBe(false)
	})

	it('the daemon’s own secrets never reach the command’s environment', async () => {
		const env = publishCommandEnv('/bin/sh', {
			CODM_RUN_TOKEN: 'x',
			JWT_SECRET: 'y',
			INTERNAL_SERVICE_KEY: 'z',
			HOME: '/home/test',
			PATH: '/bin',
		})
		expect(env.CODM_RUN_TOKEN).toBeUndefined()
		expect(env.JWT_SECRET).toBeUndefined()
		expect(env.INTERNAL_SERVICE_KEY).toBeUndefined()
		expect(env.HOME).toBe('/home/test')
		expect(env.PATH).toContain('/bin')

		const dump = await script('env.sh', 'env')
		const before = process.env.CODM_PUBLISH_TEST_SECRET
		process.env.CODM_PUBLISH_TEST_SECRET = 'leak'
		try {
			const result = await runner.run({ argv: [dump], cwd: dir, timeoutMs: 10_000 })
			expect(result.output).not.toContain('CODM_PUBLISH_TEST_SECRET')
		} finally {
			if (before === undefined) delete process.env.CODM_PUBLISH_TEST_SECRET
			else process.env.CODM_PUBLISH_TEST_SECRET = before
		}
		expect(await readFile(dump, 'utf8')).toContain('env')
	})
})
