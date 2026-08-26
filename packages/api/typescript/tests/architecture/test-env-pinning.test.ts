import { describe, expect, test } from 'bun:test'
import { readFileSync } from 'node:fs'
import { join, resolve } from 'node:path'

/**
 * RAIL ENV-01 — a `test` target that runs `bun test` must PIN `NODE_ENV=test`.
 *
 * Otherwise the same suite means different things depending on where you launch it, and the
 * difference is invisible until it isn't.
 *
 * MEASURED 2026-08-18, and this is not hypothetical — it cost a full misdiagnosis. `bun test` sets
 * `NODE_ENV=test` on its own, but an INHERITED value beats that default, and nx is launched from the
 * repo root where bun loads the root `.env` (`NODE_ENV=development`). So `app-react` had two
 * different meanings:
 *
 *   bun test      (from packages/app/react)  → NODE_ENV=test        → 270 pass, 6.95s
 *   bun run test  (nx, from the repo root)   → NODE_ENV=development → 267 pass / 3 FAIL, 15.9s
 *
 * Bisected: `VITE_API_URL` alone changes nothing; `NODE_ENV=development` alone reproduces all three
 * failures AND the 2.3x slowdown, because React, Storybook's `composeStories` and msw each branch on
 * it — a dev-mode module graph is simply a different program under test. One of the three failures
 * landed 2-4ms past a 5000ms timeout, which is a very convincing disguise: the whole thing was first
 * written up as a "load-sensitive flake" and nearly got a raised timeout, i.e. a band-aid over the
 * symptom that would have left the other two failures unexplained. Under `NODE_ENV=test` that file's
 * 5 cases run in 1219ms TOTAL; under `development` that one case alone took 5604ms.
 *
 * WHY A RAIL AND NOT JUST THE FIX: pinning app-react cures the instance. The class stays open — at
 * the time of writing, `core-typescript`, `api-typescript` and `client` all ran `bun test` unpinned
 * and were green only because nothing in them happened to branch on `NODE_ENV` yet. The day one does,
 * the failure arrives as "works on my machine, fails in CI" with no signal pointing at the cause.
 *
 * SCOPE, deliberately narrow: only targets whose command actually invokes `bun test`. Go, cargo and
 * Playwright targets do not read `NODE_ENV` this way and are not asked to declare anything — a rail
 * that demands a meaningless field of them would be noise, and noise is how a rail dies.
 */

const REPO_ROOT = resolve(import.meta.dir, '..', '..', '..', '..', '..')

/** Every project.json that declares a `test` target. Listed explicitly: the set is small, stable, and
 *  a missing entry is caught by the non-vacuity assertion below rather than silently skipped. */
const PROJECTS = [
	'packages/api/go/project.json',
	'packages/api/typescript/core/project.json',
	'packages/api/typescript/project.json',
	'packages/app/astro/project.json',
	'packages/app/react/project.json',
	'packages/app/tauri/project.json',
	'packages/app/ui/project.json',
	'packages/client/project.json',
	'packages/e2e/project.json',
]

const RUNS_BUN_TEST = /\bbun\s+test\b/

interface Target {
	file: string
	command: string
	pinned: string | undefined
}

function bunTestTargets(): Target[] {
	const out: Target[] = []
	for (const rel of PROJECTS) {
		const json = JSON.parse(readFileSync(join(REPO_ROOT, rel), 'utf8'))
		const t = json.targets?.test
		if (!t) continue
		const command = [t.options?.command, ...(t.options?.commands ?? [])].filter(Boolean).join(' ; ')
		if (!RUNS_BUN_TEST.test(command)) continue
		out.push({ file: rel, command, pinned: t.options?.env?.NODE_ENV })
	}
	return out
}

describe('test-env-pinning — a bun test target declares the environment it runs in', () => {
	test("ENV-01: every `test` target running `bun test` pins NODE_ENV='test'", () => {
		const targets = bunTestTargets()

		// Non-vacuity: if the project list ever goes stale (a path renamed, a file moved), this rail
		// would scan nothing and pass while guarding nothing — the failure mode this repo keeps finding.
		expect(
			targets.length,
			'found ZERO test targets running `bun test` — PROJECTS is stale and this rail is measuring nothing',
		).toBeGreaterThan(0)

		const unpinned = targets.filter(t => t.pinned !== 'test')
		expect(
			unpinned.map(t => t.file),
			`These \`test\` targets run \`bun test\` without pinning NODE_ENV, so their result depends on the\n` +
				`directory they are launched from (nx runs from the repo root, which loads .env → NODE_ENV=development):\n` +
				unpinned.map(t => `  ${t.file}\n    command: ${t.command}\n    NODE_ENV: ${t.pinned ?? '(unset)'}`).join('\n') +
				`\n\nAdd to the target's options:  "env": { "NODE_ENV": "test" }`,
		).toEqual([])
	})
})
