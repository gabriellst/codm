#!/usr/bin/env bun
/**
 * Builds the api-ts daemon as a single **Node-runnable** bundle (`dist/server.js`) and stages the
 * assets the bundle cannot inline. This is the ONE build path used by every gate — the nx `build`
 * target, the `bun run build` package script, the Dockerfile, and the node-boot smoke — so the
 * artifact that CI produces is exactly the artifact that runs under Node.
 *
 * Two things the raw `bun build` cannot get right on its own, both learned from a real node-boot
 * reproduction (the daemon dying in `migrateEmbeddedDatabase` before it ever listened):
 *
 *  1. **libsql is marked EXTERNAL and staged into `dist/node_modules`.** `@libsql/client` bottoms out
 *     in `libsql`, a Neon/N-API **native addon** loaded through `@neon-rs/load` from the host-triple
 *     package (`@libsql/darwin-arm64`, `@libsql/linux-x64-gnu`, …). A bundler cannot inline a `.node`
 *     binary, so the module has to stay external and be resolved from `node_modules` at runtime — but
 *     in this workspace it is only symlinked under `core/node_modules` (a transitive dep of
 *     `@codm/core-typescript`), which is NOT on the walk-up path from `dist/server.js`, so a bare
 *     external would die with `ERR_MODULE_NOT_FOUND`. We therefore copy the whole runtime closure of
 *     `@libsql/client` — itself, `@libsql/core`, `@libsql/hrana-client`, `libsql`, `@neon-rs/load`,
 *     the host-triple prebuild and their deps — FLAT into `dist/node_modules/<name>`, so the walk-up
 *     from `dist/server.js` finds the entry point AND every sibling it requires. Shipping the whole
 *     `dist/` as a unit makes the Docker image self-contained too.
 *
 *  2. **The migrations directory is COPIED to `dist/schema/migrations`.**
 *     `@codm/contracts/db/migrations` exports `migrationsDir` derived from `import.meta.url` with a
 *     `schema/migrations` suffix; the bundler rewrites `import.meta.url` to the OUTPUT file, so
 *     at runtime it resolves to `dist/schema/migrations`. Staging the drizzle-kit output at
 *     exactly that path makes the fallback correct without any env override — the destination is not
 *     free, it MIRRORS the suffix in `packages/contracts/db/migrations.ts`. (`CODM_MIGRATIONS_DIR`
 *     remains an escape hatch for images that stage them elsewhere.)
 */
import { cp, mkdir, rm } from 'node:fs/promises'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const pkgRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const distDir = join(pkgRoot, 'dist')
// MIRRORS the fallback suffix in packages/contracts/db/migrations.ts — see header note 2.
const contractsMigrations = resolve(pkgRoot, '../../contracts/db/schema/migrations')
const stagedMigrations = join(distDir, 'schema/migrations')

/** Kept external (see header) — the entry point plus the native addon package it bottoms out in. */
const EXTERNALS = ['@libsql/client', 'libsql'] as const

/**
 * Resolve the RUNTIME closure of the externals from the nested `core` package, where they are
 * symlinked as transitive deps. Copying only `@libsql/client` + `libsql` is NOT enough:
 * `@libsql/client` has four real `dependencies` of its own (`@libsql/core`, `@libsql/hrana-client`,
 * `js-base64`, `promise-limit`) and `libsql` pulls `@neon-rs/load` + `detect-libc`, so a flat copy of
 * the two named packages dies on the first nested require. We therefore walk `dependencies`
 * transitively, plus the `optionalDependencies` that are actually INSTALLED — that is how the
 * host-triple prebuild (and only the host one) enters, since `bun install` fetches the host's
 * optional dep and skips the rest. `@types/*` are skipped: type-only, never required at runtime.
 */
function resolveExternalRoots(): Map<string, string> {
	const coreDir = resolve(pkgRoot, 'core')
	const roots = new Map<string, string>()

	function walk(name: string, fromDir: string): void {
		if (roots.has(name) || name.startsWith('@types/')) return
		const pkgJsonPath = Bun.resolveSync(`${name}/package.json`, fromDir)
		const pkgDir = dirname(pkgJsonPath)
		roots.set(name, pkgDir)
		const manifest = require(pkgJsonPath) as {
			dependencies?: Record<string, string>
			optionalDependencies?: Record<string, string>
		}
		for (const dep of Object.keys(manifest.dependencies ?? {})) walk(dep, pkgDir)
		for (const dep of Object.keys(manifest.optionalDependencies ?? {})) {
			// An absent optional is another platform's prebuild — expected, not an error.
			try {
				Bun.resolveSync(`${dep}/package.json`, pkgDir)
			} catch {
				continue
			}
			walk(dep, pkgDir)
		}
	}

	for (const external of EXTERNALS) walk(external, coreDir)
	return roots
}

async function main(): Promise<void> {
	await rm(distDir, { recursive: true, force: true })
	await mkdir(distDir, { recursive: true })

	// Node target, libsql kept external (see header). `spawnSync` keeps the exit code honest so a
	// bundler error fails the gate instead of being swallowed. `--outfile` is legitimate again now
	// that nothing imports a `with { type: 'file' }` asset: the old `--outdir` + `--entry-naming`
	// contortion existed ONLY because the deleted wasm-backed embedded-Postgres driver imported its
	// `.wasm`/`.data` assets that way, forcing bun to emit sidecar files `--outfile` cannot write.
	const build = Bun.spawnSync(
		[
			'bun',
			'build',
			'--target=node',
			...EXTERNALS.flatMap(module => ['--external', module]),
			'--outfile',
			join(distDir, 'server.js'),
			join(pkgRoot, 'src/index.ts'),
		],
		{ cwd: pkgRoot, stdout: 'inherit', stderr: 'inherit' },
	)
	if (build.exitCode !== 0) process.exit(build.exitCode ?? 1)

	// Stage the migrations at the path the rewritten `import.meta.url` fallback resolves to.
	await cp(contractsMigrations, stagedMigrations, { recursive: true })

	// Stage the external libsql closure into dist/node_modules so the Node walk-up from
	// dist/server.js resolves it. `dereference` turns the .bun-store symlinks into real files that
	// travel with the bundle.
	const roots = resolveExternalRoots()
	for (const [name, root] of roots) {
		await cp(root, join(distDir, 'node_modules', name), { recursive: true, dereference: true })
	}

	console.log(`✅ node bundle built → dist/server.js (+ dist/schema/migrations + dist/node_modules/{${[...roots.keys()].join(', ')}})`)
}

main().catch(error => {
	console.error('❌ build failed:', error)
	process.exit(1)
})
