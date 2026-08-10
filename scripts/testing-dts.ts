#!/usr/bin/env bun
/**
 * testing-dts.ts — the `/testing` subpath freshness check (spec Decision 9, T7).
 *
 * THE SPIKE VERDICT (recorded here because this is the script the spec's preferred tool would have
 * lived in): `dts-bundle-generator` was tried FIRST, per spec Decision 9's stated preference —
 *
 *   bun add -d dts-bundle-generator
 *   node_modules/.bin/dts-bundle-generator -o /tmp/probe.d.ts packages/api/typescript/tests/support/testing.ts
 *
 * — both with an explicit `--project packages/api/typescript/tsconfig.json` and with default
 * project discovery. It CHOKED, reproducibly, on neither decorators nor entities but on this
 * repo's `moduleResolution: "bundler"` + extensionless-relative-import convention (the
 * `@tsconfig/bun`-suggested config every TS workspace here uses): every barrel the entry file
 * transitively reaches — `core/src/index.ts`, `packages/contracts/db/schema/index.ts`, the
 * generated wire-enum barrel — failed with `TS2307: Cannot find module './X' or its corresponding
 * type declarations` for every single extensionless specifier, because dts-bundle-generator's
 * internal compiler host does not resolve them the way `tsc`'s own CLI does under `bundler`
 * resolution. This is a repo-wide convention, not a defect in the one entry file, so there is no
 * flag/tsconfig tweak scoped to this file that fixes it.
 *
 * FALLBACK (spec D9, taken here): `packages/api/typescript/testing.d.ts` is HAND-WRITTEN and
 * COMMITTED — a structural contract for the given catalog's minimal seed surface (see that file's
 * own docblock for what "minimal" means and why it stays honest). The freshness proof is NOT a
 * generate-and-byte-compare step (there is nothing to generate) — it is the `satisfies
 * TestingSurface` check at the bottom of `packages/api/typescript/tests/support/testing.ts`, which
 * ordinary backend `tsc` already type-checks on every run (`tests/**\/*.ts` is in
 * `tsconfig.build.json`). This script exists so the fallback still answers to the SAME command name
 * (`bun testing:check-dts`) the generator path would have, and reports a git-diff style verdict
 * instead of a raw `tsc` dump.
 *
 * The companion RUNTIME check — that the exported NAME SET matches the committed catalog exactly
 * (something `satisfies` alone cannot catch: an added-but-unlisted export, or the deprecated
 * `createGivenHelpers` facade sneaking back in) — lives in
 * `packages/api/typescript/tests/architecture/testing-dts.test.ts`, run by the ordinary `bun test`.
 *
 * Usage: `bun testing:check-dts` (root package.json). No `testing:dts` counterpart exists — under
 * this fallback there is nothing to regenerate; editing `testing.d.ts` by hand IS the update.
 */
import { spawnSync } from 'node:child_process'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT_OVERRIDE = process.env.ROOT_OVERRIDE
const REPO_ROOT = ROOT_OVERRIDE ? join(ROOT_OVERRIDE) : join(dirname(fileURLToPath(import.meta.url)), '..')
const API_DIR = join(REPO_ROOT, 'packages/api/typescript')

function main(): void {
	const result = spawnSync('bun', ['x', 'tsc', '-p', 'tsconfig.build.json', '--noEmit'], {
		cwd: API_DIR,
		stdio: 'inherit',
	})
	if (result.status !== 0) {
		console.error('\n✗ packages/api/typescript/testing.d.ts has drifted from tests/support/testing.ts')
		console.error('  (the `satisfies TestingSurface` check failed — see the tsc errors above.')
		console.error('  Update packages/api/typescript/testing.d.ts by hand to match, or fix the given.)')
		process.exit(result.status ?? 1)
	}
	console.log('✔ testing.d.ts is consistent with tests/support/testing.ts (satisfies gate green)')
}

main()
