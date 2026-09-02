/**
 * graders.ts — executes one GraderSpec against a checked-out tree (worktree or repo).
 *
 * Every grader is pure pass/fail over `treeRoot`; nothing here writes to the tree.
 *
 * Detector graders run the MAIN repo's scripts/detectors/* scripts (current doctrine:
 * rules, baseline, allowlist all come from this repo) with env ROOT_OVERRIDE=<treeRoot>
 * so file discovery + reading happen in the graded tree. See the ROOT_OVERRIDE comments
 * in scripts/detectors/{registry-scan,import-direction,slice-closure}.ts.
 */

import { dirname, join, resolve } from 'node:path'
import type { GradeResult, GraderSpec, Task } from './types'
import { fileURLToPath } from 'node:url'

const SCRIPT_DIR = dirname(fileURLToPath(import.meta.url))
export const MAIN_REPO = resolve(SCRIPT_DIR, '../..')

// ─── Process execution ──────────────────────────────────────────────

interface ExecResult {
	code: number
	output: string
}

async function exec(cmd: string[], cwd: string, env?: Record<string, string>): Promise<ExecResult> {
	const proc = Bun.spawn(cmd, {
		cwd,
		env: { ...process.env, ...env },
		stdout: 'pipe',
		stderr: 'pipe',
	})
	const [stdout, stderr] = await Promise.all([new Response(proc.stdout).text(), new Response(proc.stderr).text()])
	const code = await proc.exited
	return { code, output: `${stdout}\n${stderr}`.trim() }
}

function tail(output: string, lines = 15): string {
	const all = output.split('\n')
	return all.slice(Math.max(0, all.length - lines)).join('\n')
}

// ─── Spec parsing (exported for unit tests) ─────────────────────────

/** Split '<glob>::<regex>' on the FIRST '::' — the regex may itself contain '::'. */
export function parseGrepSpec(spec: string): { glob: string; regex: RegExp } {
	const idx = spec.indexOf('::')
	if (idx <= 0) throw new Error(`grep spec must be '<glob>::<regex>', got: ${spec}`)
	const glob = spec.slice(0, idx)
	// 'm' so ^/$ anchor per line, like grep.
	return { glob, regex: new RegExp(spec.slice(idx + 2), 'm') }
}

/** Files under `treeRoot` matching `glob` (repo-relative, sorted; node_modules/.git pruned). */
export async function globFiles(treeRoot: string, glob: string): Promise<string[]> {
	const files: string[] = []
	// `dot: true` so dot-directories are traversed — graders target `.specs/**`, `.claude/**`,
	// etc. Without it Bun.Glob silently skips every dot-dir, which makes file-exists/grep-must
	// graders FAIL on correct output and grep-must-not graders VACUOUSLY PASS (zero files seen)
	// for any artifact under a dot-dir. node_modules/.git are still pruned explicitly below.
	for await (const entry of new Bun.Glob(glob).scan({ cwd: treeRoot, onlyFiles: true, dot: true })) {
		// `/`-separated before anything looks at it. Bun.Glob yields `\`-separated paths on Windows,
		// and both things that read this string are `/` contracts: the two prunes on the next line,
		// and the grader specs these paths are reported to. It is the same vacuity the `dot: true`
		// comment above describes, arriving through a second door — an unpruned `node_modules/` hit
		// makes a grep-must-not grader fail on correct output, and a path that matches no spec makes
		// a file-exists grader pass over a tree it never really inspected.
		const rel = entry.split('\\').join('/')
		if (rel.includes('node_modules/') || rel.startsWith('.git/')) continue
		files.push(rel)
	}
	return files.sort()
}

export function graderLabel(grader: GraderSpec): string {
	return grader.id ?? `${grader.kind}:${grader.spec}`
}

// ─── Grader kinds ───────────────────────────────────────────────────

const TSC_TARGETS: Record<string, { cwd: string; cmd: string[] }> = {
	backend: { cwd: 'packages/api/typescript', cmd: ['bun', 'x', 'tsc', '-p', 'tsconfig.build.json', '--noEmit'] },
	'app-react': { cwd: 'packages/app/react', cmd: ['bun', 'x', 'tsc', '--noEmit'] },
	e2e: { cwd: 'packages/e2e', cmd: ['bun', 'x', 'tsc', '--noEmit'] },
}

async function gradeTsc(spec: string, treeRoot: string): Promise<{ pass: boolean; detail: string }> {
	const target = TSC_TARGETS[spec]
	if (!target) throw new Error(`tsc grader spec must be one of ${Object.keys(TSC_TARGETS).join(' | ')}, got: ${spec}`)
	const { code, output } = await exec(target.cmd, join(treeRoot, target.cwd))
	return {
		pass: code === 0,
		detail: code === 0 ? `tsc clean in ${target.cwd}` : `tsc exit ${code} in ${target.cwd}:\n${tail(output)}`,
	}
}

const DETECTORS = ['registry-scan', 'import-direction', 'slice-closure', 'component-props', 'projection-shape', 'go-enum-literals'] as const

async function gradeDetect(spec: string, treeRoot: string): Promise<{ pass: boolean; detail: string }> {
	// spec = '<detector> [extra args...]'; defaults to --all (a detached eval tree has no git diff).
	const [name, ...extra] = spec.split(/\s+/).filter(Boolean)
	if (!DETECTORS.includes(name as (typeof DETECTORS)[number])) {
		throw new Error(`detect grader spec must start with one of ${DETECTORS.join(' | ')}, got: ${spec}`)
	}
	const script = join(MAIN_REPO, 'scripts/detectors', `${name}.ts`)
	const args = extra.length > 0 ? extra : ['--all']
	const { code, output } = await exec(['bun', script, ...args], treeRoot, { ROOT_OVERRIDE: treeRoot })
	return {
		pass: code === 0,
		detail: code === 0 ? `${name} clean` : `${name} exit ${code}:\n${tail(output)}`,
	}
}

async function gradeGrep(spec: string, treeRoot: string, must: boolean): Promise<{ pass: boolean; detail: string }> {
	const { glob, regex } = parseGrepSpec(spec)
	const files = await globFiles(treeRoot, glob)
	const hits: string[] = []
	for (const file of files) {
		const content = await Bun.file(join(treeRoot, file)).text()
		if (regex.test(content)) hits.push(file)
	}
	const pass = must ? hits.length > 0 : hits.length === 0
	const summary = `/${regex.source}/ matched ${hits.length}/${files.length} file(s) under '${glob}'`
	const evidence = hits.length > 0 ? ` — ${hits.slice(0, 5).join(', ')}${hits.length > 5 ? ', …' : ''}` : ''
	return { pass, detail: `${summary}${evidence}` }
}

async function gradeFileExists(spec: string, treeRoot: string): Promise<{ pass: boolean; detail: string }> {
	const files = await globFiles(treeRoot, spec)
	return {
		pass: files.length > 0,
		detail: files.length > 0 ? `${files.length} file(s) match '${spec}': ${files.slice(0, 5).join(', ')}` : `no file matches '${spec}'`,
	}
}

/**
 * cmd — generic command grader: `<cwd>::<command...>` (cwd relative to the tree; '.' for
 * root). Pass iff exit 0. The escape hatch for toolchains without a dedicated grader
 * (go build/test, astro check, playwright). Keep specs SHORT and deterministic.
 */
async function gradeCmd(spec: string, treeRoot: string): Promise<{ pass: boolean; detail: string }> {
	const idx = spec.indexOf('::')
	if (idx <= 0) throw new Error(`cmd grader spec must be '<cwd>::<command>', got: ${spec}`)
	const cwd = join(treeRoot, spec.slice(0, idx))
	const command = spec.slice(idx + 2).trim()
	const { code, output } = await exec(['sh', '-c', command], cwd)
	return {
		pass: code === 0,
		detail: code === 0 ? `\`${command}\` exit 0 in ${spec.slice(0, idx)}` : `\`${command}\` exit ${code}:\n${tail(output)}`,
	}
}

const BACKEND_PREFIX = 'packages/api/typescript/'

async function gradeTestGreen(spec: string, treeRoot: string): Promise<{ pass: boolean; detail: string }> {
	// Backend tests run from the package dir so bunfig.toml's reflect-metadata preload applies.
	const backend = spec.startsWith(BACKEND_PREFIX)
	const cwd = backend ? join(treeRoot, BACKEND_PREFIX) : treeRoot
	const target = backend ? spec.slice(BACKEND_PREFIX.length) : spec
	const { code, output } = await exec(['bun', 'test', target], cwd)
	return {
		pass: code === 0,
		detail: code === 0 ? `bun test ${target} green` : `bun test ${target} exit ${code}:\n${tail(output)}`,
	}
}

// ─── judge — LLM rubric verdict (L3 composition / L5 quality judgments) ─

const JUDGE_TIMEOUT_MS = Number(process.env.JUDGE_TIMEOUT_MS || 5 * 60 * 1000)

/**
 * Spawns a headless read-only `claude -p` (haiku) inside the graded tree with a rubric.
 * The judge inspects files (Read/Grep/Glob need no permissions) and must end its answer
 * with `VERDICT: PASS` or `VERDICT: FAIL — <reason>`. Anything else (timeout, crash,
 * no verdict line) grades as fail with the evidence attached.
 */
export async function gradeJudge(
	spec: string,
	treeRoot: string,
	model = process.env.JUDGE_MODEL || 'haiku',
): Promise<{ pass: boolean; detail: string }> {
	const prompt = `You are a strict architecture judge inspecting the repository at your cwd.
Rubric:
${spec}

Inspect the relevant files (Read/Grep/Glob). Judge ONLY the rubric — not style.
Your FINAL line must be exactly 'VERDICT: PASS' or 'VERDICT: FAIL — <one-line reason>'.`
	// One retry on a missing verdict: truncated judges (output ends mid-checklist with no
	// VERDICT line) are an instrument failure, not evidence about the tree — measured live
	// on e2e-notif-iter1, where every mechanical grader passed and the judge died at '✓'.
	let output = ''
	let errOut = ''
	let code = 0
	for (let attempt = 0; attempt < 2; attempt++) {
		const proc = Bun.spawn(['claude', '-p', prompt, '--model', model], {
			cwd: treeRoot,
			stdout: 'pipe',
			stderr: 'pipe',
		})
		const killer = setTimeout(() => proc.kill(), JUDGE_TIMEOUT_MS)
		;[output, errOut, code] = await Promise.all([new Response(proc.stdout).text(), new Response(proc.stderr).text(), proc.exited])
		clearTimeout(killer)
		if (parseVerdict(output)) break
	}
	const verdict = parseVerdict(output)
	if (!verdict) {
		return { pass: false, detail: `judge gave no verdict after retry (exit ${code}): ${tail(output || errOut)}` }
	}
	return {
		pass: verdict.pass,
		detail: verdict.pass ? 'judge: PASS' : `judge: FAIL — ${verdict.reason ?? 'no reason given'}`,
	}
}

/** Last VERDICT: line wins — judges sometimes restate the rubric (which mentions both tokens). */
export function parseVerdict(output: string): { pass: boolean; reason?: string } | null {
	const all = [...output.matchAll(/VERDICT:\s*(PASS|FAIL)(?:\s*[—–-]+\s*(.*))?/g)]
	const last = all.at(-1)
	if (!last) return null
	return { pass: last[1] === 'PASS', reason: last[2]?.trim() || undefined }
}

// ─── Entry point ────────────────────────────────────────────────────

export async function runGrader(task: Task, grader: GraderSpec, treeRoot: string): Promise<GradeResult> {
	const label = graderLabel(grader)
	try {
		let result: { pass: boolean; detail: string }
		switch (grader.kind) {
			case 'tsc':
				result = await gradeTsc(grader.spec, treeRoot)
				break
			case 'detect':
				result = await gradeDetect(grader.spec, treeRoot)
				break
			case 'grep-must':
				result = await gradeGrep(grader.spec, treeRoot, true)
				break
			case 'grep-must-not':
				result = await gradeGrep(grader.spec, treeRoot, false)
				break
			case 'file-exists':
				result = await gradeFileExists(grader.spec, treeRoot)
				break
			case 'test-green':
				result = await gradeTestGreen(grader.spec, treeRoot)
				break
			case 'judge':
				result = await gradeJudge(grader.spec, treeRoot, grader.model)
				break
			case 'cmd':
				result = await gradeCmd(grader.spec, treeRoot)
				break
			default: {
				const _: never = grader.kind
				throw new Error(`unknown grader kind: ${grader.kind}`)
			}
		}
		return { task: task.id, grader: label, ...result }
	} catch (error) {
		// A grader that cannot even run is a failing grader, with the error as evidence.
		return { task: task.id, grader: label, pass: false, detail: `grader error: ${(error as Error).message}` }
	}
}
