import { describe, expect, test } from 'bun:test'
import { existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { CONTEXTS } from '@shared/contexts'

/**
 * Wiring-completeness guard — kills the "orphan artifact" class: a file that exists, compiles and
 * passes its unit tests but is NEVER REGISTERED, so it silently does nothing at runtime. This is
 * the exact shape of the worst bug of the de-template reorg (13 of 18 billing handlers existed but
 * were not exported from the handlers barrel — a paid invoice never activated its subscription) and
 * of CMPL-06/07/11/12 from the completeness-reinforcement plan.
 *
 * The registration surfaces are BARRELS/ARRAYS by design (bundler-friendly), i.e. inevitable
 * redeclarations — so they are GATED, not derived:
 *   WIRE-01 — every `*Handler.ts` in src/<ctx>/handlers/ is exported from internal.ts or external.ts.
 *   WIRE-02 — every `*Job.ts` in src/<ctx>/jobs/ is referenced in the context's index.ts (jobs: []).
 *   WIRE-03 — every controller class (`extends Controller`) is exported from controllers/index.ts.
 * (CMPL-06 — registry present for all 3 envs per context — became a COMPILE error in F1a.2 via
 * `satisfies Record<ContextModule, InstanceRegistry>`; no runtime rail needed.)
 */

const API_SRC = join(import.meta.dir, '..', '..', 'src')
const MODULES = Object.keys(CONTEXTS)

const tsFiles = (dir: string): string[] =>
	existsSync(dir) ? readdirSync(dir).filter(f => f.endsWith('.ts') && !f.endsWith('.test.ts')) : []

interface Violation {
	context: string
	artifact: string
	problem: string
}

function scanHandlers(root: string): Violation[] {
	const violations: Violation[] = []
	for (const ctx of MODULES) {
		const dir = join(root, ctx, 'handlers')
		const files = tsFiles(dir).filter(f => f.endsWith('Handler.ts'))
		if (files.length === 0) continue
		const barrels = ['internal.ts', 'external.ts']
			.map(b => join(dir, b))
			.filter(existsSync)
			.map(b => readFileSync(b, 'utf8'))
			.join('\n')
		for (const file of files) {
			const name = file.replace(/\.ts$/, '')
			if (!new RegExp(`\\b${name}\\b`).test(barrels)) {
				violations.push({ context: ctx, artifact: `handlers/${file}`, problem: 'not exported from internal.ts/external.ts — the handler is DEAD wiring' })
			}
		}
	}
	return violations
}

function scanJobs(root: string): Violation[] {
	const violations: Violation[] = []
	for (const ctx of MODULES) {
		const dir = join(root, ctx, 'jobs')
		const files = tsFiles(dir).filter(f => f.endsWith('Job.ts'))
		if (files.length === 0) continue
		const indexPath = join(root, ctx, 'index.ts')
		const index = existsSync(indexPath) ? readFileSync(indexPath, 'utf8') : ''
		for (const file of files) {
			const name = file.replace(/\.ts$/, '')
			if (!new RegExp(`\\b${name}\\b`).test(index)) {
				violations.push({ context: ctx, artifact: `jobs/${file}`, problem: `not referenced in ${ctx}/index.ts jobs: [] — the job never schedules` })
			}
		}
	}
	return violations
}

function scanControllers(root: string): Violation[] {
	const violations: Violation[] = []
	for (const ctx of MODULES) {
		const dir = join(root, ctx, 'controllers')
		const files = tsFiles(dir).filter(f => f !== 'index.ts')
		if (files.length === 0) continue
		const barrelPath = join(dir, 'index.ts')
		const barrel = existsSync(barrelPath) ? readFileSync(barrelPath, 'utf8') : ''
		for (const file of files) {
			const source = readFileSync(join(dir, file), 'utf8')
			for (const m of source.matchAll(/export class (\w+) extends Controller\b/g)) {
				const cls = m[1] ?? ''
				if (!new RegExp(`\\b${cls}\\b`).test(barrel)) {
					violations.push({ context: ctx, artifact: `controllers/${file}#${cls}`, problem: 'controller class not exported from controllers/index.ts — no route is registered' })
				}
			}
		}
	}
	return violations
}

const report = (v: Violation[]) => v.map(x => `  ${x.context}/${x.artifact}  →  ${x.problem}`).join('\n')

describe('wiring-completeness (an artifact that exists MUST be registered — orphan files are dead wiring)', () => {
	test('WIRE-01: every *Handler.ts is exported from its context handler barrel', () => {
		const v = scanHandlers(API_SRC)
		expect(v.length, `Orphan handler(s) — export from internal.ts (domain events) or external.ts (integration events):\n${report(v)}`).toBe(0)
	})

	test('WIRE-02: every *Job.ts is referenced by its context index.ts', () => {
		const v = scanJobs(API_SRC)
		expect(v.length, `Orphan job(s) — add to the jobs: [] array in the context's BoundedContext.create:\n${report(v)}`).toBe(0)
	})

	test('WIRE-03: every controller class is exported from its controllers barrel', () => {
		const v = scanControllers(API_SRC)
		expect(v.length, `Orphan controller(s) — export from controllers/index.ts so the router registers the route:\n${report(v)}`).toBe(0)
	})

	// Negative fixture — proves each scan catches an orphan (temp dir, not the real tree).
	test('fixture: an unexported handler, job and controller are all flagged', () => {
		const tmpRoot = mkdtempSync(join(tmpdir(), 'wiring-fixture-'))
		const write = (p: string, c: string) => {
			mkdirSync(p.slice(0, p.lastIndexOf('/')), { recursive: true })
			writeFileSync(p, c)
		}
		try {
			// Uses a REAL context module name so MODULES matches inside the fixture root.
			write(join(tmpRoot, 'owner', 'handlers', 'GhostHandler.ts'), 'export class GhostHandler {}\n')
			write(join(tmpRoot, 'owner', 'handlers', 'internal.ts'), "export { OtherHandler } from './OtherHandler'\n")
			write(join(tmpRoot, 'owner', 'jobs', 'GhostJob.ts'), 'export class GhostJob {}\n')
			write(join(tmpRoot, 'owner', 'index.ts'), 'const jobs = []\n')
			write(join(tmpRoot, 'owner', 'controllers', 'Ghost.ts'), 'export class GhostController extends Controller {}\n')
			write(join(tmpRoot, 'owner', 'controllers', 'index.ts'), '// empty barrel\n')
			expect(scanHandlers(tmpRoot).map(v => v.artifact)).toEqual(['handlers/GhostHandler.ts'])
			expect(scanJobs(tmpRoot).map(v => v.artifact)).toEqual(['jobs/GhostJob.ts'])
			expect(scanControllers(tmpRoot).map(v => v.artifact)).toEqual(['controllers/Ghost.ts#GhostController'])
		} finally {
			rmSync(tmpRoot, { recursive: true, force: true })
		}
	})
})
