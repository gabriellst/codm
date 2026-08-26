#!/usr/bin/env bun
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

/**
 * Cross-service test runner — ONE `bun test` PROCESS PER FILE.
 *
 * Why per-file, never `bun test fileA fileB …` (a single shared process): T9 found empirically
 * that re-booting `services: ['apiGo']` in the SAME process after a PRIOR file's
 * `backend.stop()` leaves the TS side holding a stale/disconnected DB handle — writes the
 * gateway subprocess makes afterwards become invisible to the next file's assertions (a repeat
 * of the T7/T8 law "one backend per process", one level up: one backend LIFECYCLE per process).
 * So every file that boots `services: ['apiGo']` — the go-boundary-services architecture suite
 * and each `*.services.test.tsx` — gets its OWN `bun test` invocation, so its
 * `beforeAll`/`afterAll` backend never shares a process with another file's.
 *
 * `--path-ignore-patterns=**\/__run_everything__/**` on each invocation overrides (never merges
 * with) `bunfig.toml`'s `pathIgnorePatterns` — which excludes these files from the DEFAULT
 * `bun test` run — with a pattern that matches nothing, so passing the file explicitly here
 * still picks it up. Mirrors the flag already used for the single-file case in
 * `packages/api/typescript`'s `test:cross-service`.
 */

const REACT_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const PATH_IGNORE_OVERRIDE = '--path-ignore-patterns=**/__run_everything__/**'

const ARCHITECTURE_FILE = 'tests/architecture/go-boundary-services.test.ts'

/** Every colocated `services: ['apiGo']` suite — sorted for a deterministic run order. */
function findServiceTestFiles(): string[] {
	const glob = new Bun.Glob('src/**/*.services.test.tsx')
	return [...glob.scanSync(REACT_ROOT)].sort()
}

interface FileResult {
	file: string
	ok: boolean
	ms: number
}

function runOne(file: string): FileResult {
	const started = performance.now()
	const result = Bun.spawnSync(['bun', 'test', PATH_IGNORE_OVERRIDE, file], {
		cwd: REACT_ROOT,
		stdout: 'inherit',
		stderr: 'inherit',
	})
	const ms = performance.now() - started
	return { file, ok: result.exitCode === 0, ms }
}

function main() {
	const files = [ARCHITECTURE_FILE, ...findServiceTestFiles()]
	console.log(`[test:cross-service] ${files.length} file(s), one bun process each (isolation law — see docblock)`)

	const results: FileResult[] = []
	for (const file of files) {
		console.log(`\n[test:cross-service] === ${file} ===`)
		results.push(runOne(file))
	}

	console.log('\n[test:cross-service] summary:')
	for (const r of results) {
		console.log(`  ${r.ok ? 'PASS' : 'FAIL'}  ${(r.ms / 1000).toFixed(2)}s  ${r.file}`)
	}

	const allOk = results.every(r => r.ok)
	process.exit(allOk ? 0 : 1)
}

main()
