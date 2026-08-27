import { describe, expect, test } from 'bun:test'
import { spawnSync } from 'node:child_process'
import { mkdtempSync, mkdirSync, rmSync, cpSync, readdirSync, readFileSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

/**
 * Diff-zero gate (ported from template-fullstack packages/contracts/src/db/schema-drift.test.ts,
 * adapted to codm's shape: unlike the template — where the sqlite family is an infra-only mirror
 * and the pg family carries the product schema — codm runs BOTH families as full, independent
 * product schemas (ADR 0005, "the applier is family-owned"): `db/sqlite/` is the sqlite/libsql
 * trunk the desktop daemon + Go gateway share, `db/pg/` is the pg trunk for auth+owner. Neither
 * is a subset of the other, so this gate runs the SAME diff-zero check against BOTH trunks
 * independently instead of merging a product schema with a shared infra schema like the template
 * does.
 *
 * `drizzle-kit generate` is the only oracle for "does the committed migration set still match
 * every schema.ts on disk": it diffs the CURRENT schema against the last snapshot under
 * `<trunk>/migrations/meta` and, on ANY drift (a column added/removed/retyped), writes a NEW
 * `.sql` file. `generate` never touches a live database (`dbCredentials` is read only by
 * `migrate`/`push`/`studio`), so this gate runs fully offline — no Docker/Postgres/libsql needed —
 * against a scratch COPY of the committed migrations. The real `<trunk>/migrations/` is never
 * written to by this file.
 *
 * Two shapes learned the hard way while building the template's version of this gate (measured
 * 2026-08-12, that tree — still true here):
 *   - `out` MUST be relative with `cwd` set to match, never absolute. drizzle-kit's existing-
 *     snapshot reader mis-resolves an absolute `out`, so every scratch run below sets
 *     `out: './migrations'` and spawns with `cwd` pointed at the scratch dir.
 *   - A schema file drizzle-kit reads is `require()`d as CJS, so it must resolve
 *     `drizzle-orm/{pg,sqlite}-core` — which only works from an ancestor with `node_modules`, so
 *     the falsifier's nudged copy cannot live in `/tmp`. It lives under `node_modules/.cache`
 *     (`PROBE_ROOT` below) — an ancestor that resolves, and the one directory OUTSIDE the scanned
 *     source tree. See `PROBE_ROOT` for why that distinction is load-bearing.
 */

// Package root. This file lives at `src/db/schema-drift.test.ts` — TWO levels up from
// `import.meta.dir` (`src/db`) reaches `packages/contracts`, not one.
const CONTRACTS_DIR = resolve(import.meta.dir, '..', '..')

/**
 * Where the falsifier's nudged schema copy lives.
 *
 * Two constraints pull in opposite directions: drizzle-kit `require()`s the schema as CJS, so the
 * file needs an ancestor carrying `node_modules` (rules out `/tmp`) — but ANY path inside the
 * source tree is walked by the repo's tree-scanning rails, and this file appears and vanishes
 * mid-run. That is not hypothetical: with the probe under `src/db/<dialect>/`, `product-residue`
 * died with `ENOENT ... .schema-drift-falsifier-probe-sqlite/infrastructure.nudged.ts` (CI,
 * 2026-08-27) — it had listed the file and read it after this test's `finally` removed it. The two
 * suites run as separate nx processes, so the race is real and lands on whichever PR draws it.
 *
 * `node_modules/.cache` satisfies both: resolution reaches `drizzle-orm` through the ancestor
 * `node_modules`, and `node_modules` is the ONE directory every walker in this repo already
 * excludes — so the fix holds for rails that do not exist yet. Same place, same reason, as
 * `core/src/types/Controller.typecheck.test.ts`; the pid keeps two concurrent runs apart.
 */
const PROBE_ROOT = resolve(CONTRACTS_DIR, '..', '..', 'node_modules', '.cache')

type Trunk = {
	readonly name: string
	readonly dialect: 'sqlite' | 'postgresql'
	readonly migrationsDir: string
	readonly schemaEntry: string
	/** A still-present anchor line in the schema entry's infrastructure export, nudged by the falsifier. */
	readonly nudgeFile: string
	readonly nudgeAnchor: string
}

const TRUNKS: readonly Trunk[] = [
	{
		name: 'sqlite (src/db/sqlite — desktop daemon + Go gateway trunk)',
		dialect: 'sqlite',
		migrationsDir: join(CONTRACTS_DIR, 'src', 'db', 'sqlite', 'migrations'),
		schemaEntry: join(CONTRACTS_DIR, 'src', 'db', 'sqlite', 'index.ts'),
		nudgeFile: join(CONTRACTS_DIR, 'src', 'db', 'sqlite', 'infrastructure.ts'),
		nudgeAnchor: "\t\tlastError: text('last_error'),",
	},
	{
		name: 'postgresql (src/db/pg — auth + owner trunk)',
		dialect: 'postgresql',
		migrationsDir: join(CONTRACTS_DIR, 'src', 'db', 'pg', 'migrations'),
		schemaEntry: join(CONTRACTS_DIR, 'src', 'db', 'pg', 'schema', 'index.ts'),
		nudgeFile: join(CONTRACTS_DIR, 'src', 'db', 'pg', 'schema', 'infrastructure.ts'),
		nudgeAnchor: "\t\tlastError: text('last_error'),",
	},
]

/** Resolves the `drizzle-kit` CLI entrypoint via real module resolution (walks the same
 *  node_modules chain a normal import would — workspace-hoisted root, or a worktree's fall-through,
 *  see CLAUDE.md "Worktree Development") instead of hardcoding a `.bin` path that could go stale. */
function drizzleKitBin(): string {
	const pkgPath = fileURLToPath(import.meta.resolve('drizzle-kit/package.json'))
	const pkg = JSON.parse(readFileSync(pkgPath, 'utf8')) as { bin?: Record<string, string> }
	const rel = pkg.bin?.['drizzle-kit']
	if (!rel) throw new Error('drizzle-kit package.json has no bin.drizzle-kit entry — the CLI shape changed upstream.')
	return join(dirname(pkgPath), rel)
}

function writeScratchConfig(configPath: string, schema: string, dialect: Trunk['dialect']): void {
	const dbCredentials =
		dialect === 'sqlite' ? `{ url: './scratch.db' }` : `{ url: 'postgresql://codm:codm@localhost:5432/codm_scratch' }`
	writeFileSync(
		configPath,
		[
			`export default {`,
			`\tschema: ${JSON.stringify(schema)},`,
			`\tout: './migrations',`,
			`\tdialect: ${JSON.stringify(dialect)},`,
			`\tdbCredentials: ${dbCredentials},`,
			`\tstrict: true,`,
			`}`,
			``,
		].join('\n'),
	)
}

/** Runs `generate` with `cwd: scratchDir` — see the docblock above for why `out` must stay relative. */
function runGenerate(scratchDir: string, configPath: string): { output: string; status: number | null } {
	const result = spawnSync('bun', [drizzleKitBin(), 'generate', `--config=${configPath}`], { cwd: scratchDir, encoding: 'utf8' })
	return { output: `${result.stdout ?? ''}${result.stderr ?? ''}`, status: result.status }
}

describe.each(TRUNKS)('drizzle schema diff-zero — $name', trunk => {
	test('generate against the committed migrations produces no new SQL file', () => {
		const scratch = mkdtempSync(join(tmpdir(), 'drizzle-diff-zero-'))
		try {
			cpSync(trunk.migrationsDir, join(scratch, 'migrations'), { recursive: true })
			const before = readdirSync(join(scratch, 'migrations'))
				.filter(f => f.endsWith('.sql'))
				.sort()

			const configPath = join(scratch, 'drizzle.config.mjs')
			writeScratchConfig(configPath, trunk.schemaEntry, trunk.dialect)
			const { output, status } = runGenerate(scratch, configPath)

			const after = readdirSync(join(scratch, 'migrations'))
				.filter(f => f.endsWith('.sql'))
				.sort()

			expect(status, `drizzle-kit generate exited non-zero:\n${output}`).toBe(0)
			expect(
				after,
				`drizzle-kit generate produced a NEW migration — ${trunk.migrationsDir} no longer matches ` +
					`${trunk.schemaEntry}. Run \`bun migrate:create\` and commit the result:\n${output}`,
			).toEqual(before)
		} finally {
			rmSync(scratch, { recursive: true, force: true })
		}
	})

	test('FALSEADOR — a synthetic column nudge on the schema produces a NEW migration (RED), proving the check above can fail', () => {
		const scratch = mkdtempSync(join(tmpdir(), 'drizzle-diff-zero-falsifier-'))
		// Outside the source tree, inside an ancestor with node_modules — see PROBE_ROOT.
		const probeDir = join(PROBE_ROOT, `schema-drift-falsifier-probe-${trunk.dialect}-${process.pid}`)
		try {
			cpSync(trunk.migrationsDir, join(scratch, 'migrations'), { recursive: true })
			const before = readdirSync(join(scratch, 'migrations')).filter(f => f.endsWith('.sql'))

			const realSchema = readFileSync(trunk.nudgeFile, 'utf8')
			expect(realSchema, 'the nudge anchor drifted — update it to a still-present line in infrastructure.ts').toContain(
				trunk.nudgeAnchor,
			)
			const nudged = realSchema.replace(
				trunk.nudgeAnchor,
				`${trunk.nudgeAnchor}\n\tnudgeProbe: text('nudge_probe'),`,
			)

			mkdirSync(probeDir, { recursive: true })
			const nudgedSchemaPath = join(probeDir, 'infrastructure.nudged.ts')
			writeFileSync(nudgedSchemaPath, nudged)

			// The probe file re-exports the trunk's index but swaps in the nudged infrastructure —
			// drizzle-kit only follows the schema entry it's told, so we point it straight at the nudge.
			const configPath = join(scratch, 'drizzle.config.mjs')
			writeScratchConfig(configPath, nudgedSchemaPath, trunk.dialect)
			runGenerate(scratch, configPath)

			const after = readdirSync(join(scratch, 'migrations')).filter(f => f.endsWith('.sql'))
			expect(
				after.length,
				'the nudge did not produce a new migration — the falsifier is not exercising drift detection, so the check above cannot be trusted to fail',
			).toBeGreaterThan(before.length)
		} finally {
			rmSync(scratch, { recursive: true, force: true })
			rmSync(probeDir, { recursive: true, force: true })
		}
	})
})
