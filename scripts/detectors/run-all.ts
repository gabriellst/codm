#!/usr/bin/env bun
/**
 * Runs EVERY detector and aggregates the exit code.
 *
 * Why this exists: `detect` used to be a `&&` chain of six detectors. `registry-scan` legitimately
 * exits 1 whenever it has findings, so the chain short-circuited there and the other FIVE never ran —
 * silently. A gate that reports "39 findings" while executing 1/6 of its checks is worse than no gate,
 * because the number looks like coverage. Found while cleaning up Fase 3 of the agent-abstraction goal,
 * where `slice-closure` (the rail that owns SCW-01a) had never once executed under `bun run detect`.
 *
 * Contract: every detector runs, its output is streamed through, and the process exits non-zero if ANY
 * of them did. Never `&&`, and never `| tee` (which swallows exit codes — same class of bug).
 */
const DETECTORS: readonly (readonly [name: string, args: readonly string[]])[] = [
	['registry-scan', []],
	['import-direction', ['--all']],
	['slice-closure', []],
	['component-props', []],
	['projection-shape', []],
	['go-enum-literals', []],
]

const failed: string[] = []

for (const [name, args] of DETECTORS) {
	console.log(`\n─── ${name} ${'─'.repeat(Math.max(0, 60 - name.length))}`)
	const proc = Bun.spawnSync(['bun', `scripts/detectors/${name}.ts`, ...args], {
		stdout: 'inherit',
		stderr: 'inherit',
	})
	if (proc.exitCode !== 0) failed.push(name)
}

console.log(`\n${'═'.repeat(64)}`)
if (failed.length > 0) {
	console.log(`detect: ${failed.length}/${DETECTORS.length} detector(s) reported findings — ${failed.join(', ')}`)
	process.exit(1)
}
console.log(`detect: all ${DETECTORS.length} detectors clean`)
