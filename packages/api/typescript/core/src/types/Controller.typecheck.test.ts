import { afterAll, beforeAll, describe, expect, it } from 'bun:test'
import { existsSync, mkdirSync, rmSync, writeFileSync } from 'node:fs'
import path from 'node:path'

/**
 * Negative-proof for the Controller InputSchema envelope constraint (CTRL-07).
 *
 * Spawns `bun x tsc --noEmit` on tiny fixture projects that extend Controller:
 * - a flat root key (outside body/query/params/ctx) must FAIL to compile, with the
 *   branded constraint message naming the offending key;
 * - valid envelopes — including ones wrapped by .refine() / .transform() (ZodPipe),
 *   whose underlying object shape is valid — must compile.
 *
 * Fixtures live under <repo>/node_modules/.cache so module resolution reaches the
 * repo's zod/tsyringe-neo while no project tsconfig ever picks them up.
 */

const repoRoot = (() => {
	let dir = import.meta.dir
	while (!existsSync(path.join(dir, 'node_modules'))) {
		const parent = path.dirname(dir)
		if (parent === dir) throw new Error('repo root with node_modules not found')
		dir = parent
	}
	return dir
})()

const tempDir = path.join(repoRoot, 'node_modules', '.cache', `controller-envelope-typecheck-${process.pid}`)
// Extension-less relative specifier to this folder's Controller.ts, from the fixture dir.
const controllerImport = path.relative(tempDir, path.join(import.meta.dir, 'Controller'))
const httpImport = path.relative(tempDir, path.join(import.meta.dir, 'Http'))

const fixtureHeader = `
import { z } from 'zod'
import { Controller } from '${controllerImport}'
import { HttpStatusCode } from '${httpImport}'

const OutputSchema = z.void()
`

const validFixture = `${fixtureHeader}
const PlainEnvelope = z.object({
	ctx: z.object({ user: z.object({ id: z.string() }) }),
	body: z.object({ name: z.string() }),
	query: z.object({ page: z.string().optional() }),
	params: z.object({ id: z.string() }),
})

export class PlainEnvelopeController extends Controller<typeof PlainEnvelope, typeof OutputSchema> {
	readonly path = '/valid/:id'
	readonly method = 'post' as const
	readonly description = 'valid plain envelope'
	readonly inputSchema = PlainEnvelope
	readonly outputSchema = OutputSchema
	async handle(): Promise<this['output']> {
		return { status: HttpStatusCode.OK, data: undefined }
	}
}

// Root-level .refine() keeps the underlying object shape — must still satisfy the constraint.
const RefinedEnvelope = z
	.object({
		body: z.object({ password: z.string(), confirmPassword: z.string() }),
	})
	.refine(data => data.body.password === data.body.confirmPassword)

export class RefinedEnvelopeController extends Controller<typeof RefinedEnvelope, typeof OutputSchema> {
	readonly path = '/refined'
	readonly method = 'post' as const
	readonly description = 'valid refined envelope'
	readonly inputSchema = RefinedEnvelope
	readonly outputSchema = OutputSchema
	async handle(): Promise<this['output']> {
		return { status: HttpStatusCode.OK, data: undefined }
	}
}

// Root-level .transform() wraps the object in a ZodPipe — the constraint must see
// through to the underlying input shape.
const PipedEnvelope = z
	.object({
		body: z.object({ name: z.string() }),
	})
	.transform(data => data)

export class PipedEnvelopeController extends Controller<typeof PipedEnvelope, typeof OutputSchema> {
	readonly path = '/piped'
	readonly method = 'post' as const
	readonly description = 'valid piped envelope'
	readonly inputSchema = PipedEnvelope
	readonly outputSchema = OutputSchema
	async handle(): Promise<this['output']> {
		return { status: HttpStatusCode.OK, data: undefined }
	}
}

// Empty input (no body/query/params/ctx at all) is a valid envelope.
const EmptyEnvelope = z.object({})

export class EmptyEnvelopeController extends Controller<typeof EmptyEnvelope, typeof OutputSchema> {
	readonly path = '/empty'
	readonly method = 'get' as const
	readonly description = 'valid empty envelope'
	readonly inputSchema = EmptyEnvelope
	readonly outputSchema = OutputSchema
	async handle(): Promise<this['output']> {
		return { status: HttpStatusCode.OK, data: undefined }
	}
}
`

const invalidFixture = `${fixtureHeader}
const FlatEnvelope = z.object({
	ctx: z.object({ user: z.object({ id: z.string() }) }),
	token: z.string(),
})

export class FlatEnvelopeController extends Controller<typeof FlatEnvelope, typeof OutputSchema> {
	readonly path = '/flat'
	readonly method = 'post' as const
	readonly description = 'invalid flat envelope'
	readonly inputSchema = FlatEnvelope
	readonly outputSchema = OutputSchema
	async handle(): Promise<this['output']> {
		return { status: HttpStatusCode.OK, data: undefined }
	}
}
`

function writeFixtureProject(name: string, source: string): string {
	const file = `${name}.ts`
	writeFileSync(path.join(tempDir, file), source)
	const tsconfigPath = path.join(tempDir, `tsconfig.${name}.json`)
	writeFileSync(
		tsconfigPath,
		JSON.stringify({
			extends: '@tsconfig/bun/tsconfig.json',
			compilerOptions: {
				verbatimModuleSyntax: false,
				types: ['bun'],
			},
			include: [file],
		}),
	)
	return tsconfigPath
}

function runTsc(tsconfigPath: string): { exitCode: number; output: string } {
	const proc = Bun.spawnSync(['bun', 'x', 'tsc', '--noEmit', '--pretty', 'false', '-p', tsconfigPath], { cwd: tempDir })
	return { exitCode: proc.exitCode, output: `${proc.stdout.toString()}${proc.stderr.toString()}` }
}

beforeAll(() => {
	mkdirSync(tempDir, { recursive: true })
})

afterAll(() => {
	rmSync(tempDir, { recursive: true, force: true })
})

describe('Controller InputSchema envelope constraint (CTRL-07)', () => {
	it(
		'rejects an InputSchema with a flat root key at compile time, naming the rule and the key',
		() => {
			const { exitCode, output } = runTsc(writeFixtureProject('invalid', invalidFixture))
			expect(exitCode).not.toBe(0)
			expect(output).toContain('TS2344')
			expect(output).toContain('InputSchema root keys must be body | query | params | ctx')
			expect(output).toContain('"token"')
		},
		{ timeout: 120_000 },
	)

	it(
		'accepts plain, refined, piped and empty envelopes',
		() => {
			const { exitCode, output } = runTsc(writeFixtureProject('valid', validFixture))
			expect(output.includes('error TS') ? output : '').toBe('')
			expect(exitCode).toBe(0)
		},
		{ timeout: 120_000 },
	)
})
