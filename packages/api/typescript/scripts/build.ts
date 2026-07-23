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
 *  1. **PGlite is marked EXTERNAL and staged into `dist/node_modules`.** `@electric-sql/pglite` ships
 *     a WASM runtime plus sidecar assets (`pglite.data`, `pglite.wasm`) that it resolves RELATIVE TO
 *     ITS OWN MODULE at runtime. If the bundler inlines the JS, those assets are orphaned and the
 *     first `CREATE SCHEMA` dies with `ENOENT … pglite.data`. Keeping it external means Node resolves
 *     it from `node_modules` at runtime — but in this workspace pglite is only symlinked under
 *     `core/node_modules` (a transitive dep of `@codedm/core-typescript`), which is NOT on the
 *     walk-up path from `dist/server.js`, so a bare external would die with `ERR_MODULE_NOT_FOUND`.
 *     We therefore copy the (dependency-free, self-contained) package into `dist/node_modules/
 *     @electric-sql/pglite`, so the walk-up from `dist/server.js` finds it AND the WASM assets travel
 *     with the bundle. Shipping the whole `dist/` as a unit makes the Docker image self-contained too.
 *
 *  2. **The migrations directory is COPIED to `dist/migrations`.** `@codedm/contracts/db/migrations`
 *     exports `migrationsDir` derived from `import.meta.url`; the bundler rewrites that to the OUTPUT
 *     file, so at runtime it resolves to `dist/migrations`. Staging the Drizzle output there makes
 *     the fallback correct without any env override. (`CODEDM_MIGRATIONS_DIR` remains an escape hatch
 *     for images that stage them elsewhere.)
 */
import { cp, mkdir, readdir, rm } from 'node:fs/promises'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const pkgRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const distDir = join(pkgRoot, 'dist')
const contractsMigrations = resolve(pkgRoot, '../../contracts/db/migrations')

// Resolve the PGlite package root from the nested `core` package, where it is symlinked as a
// transitive dep. `Bun.resolveSync` follows the workspace resolution; we take the package.json and
// climb to its directory. Dereferenced on copy so the `.bun` store target travels as real files.
function resolvePgliteRoot(): string {
	const coreDir = resolve(pkgRoot, 'core')
	const pkgJson = Bun.resolveSync('@electric-sql/pglite/package.json', coreDir)
	return dirname(pkgJson)
}

async function main(): Promise<void> {
	await rm(distDir, { recursive: true, force: true })
	await mkdir(distDir, { recursive: true })

	// Node target, PGlite kept external (see header). `spawnSync` keeps the exit code honest so a
	// bundler error fails the gate instead of being swallowed.
	//
	// `--outdir` (not `--outfile`): PGliteDriver statically imports pglite.wasm/pglite.data as `file`
	// assets so the `bun build --compile` Tauri sidecar can EMBED them (a compiled binary can't lazily
	// read them from node_modules). Under `--target=node` bun would emit those same two assets as
	// sidecar files, which `--outfile` can't do ("cannot write multiple output files without an output
	// directory"). We emit to a dir (entry pinned to `server.js`) and then DELETE the orphaned asset
	// copies below — the node path never reads them (PGliteDriver only uses the embedded handles when
	// its imported path is a `/$bunfs/…` one, i.e. inside the compiled binary), it resolves pglite +
	// its assets from `dist/node_modules/@electric-sql/pglite` instead.
	const build = Bun.spawnSync(
		[
			'bun',
			'build',
			'--target=node',
			'--external',
			'@electric-sql/pglite',
			'--outdir',
			distDir,
			'--entry-naming',
			'server.js',
			join(pkgRoot, 'src/index.ts'),
		],
		{ cwd: pkgRoot, stdout: 'inherit', stderr: 'inherit' },
	)
	if (build.exitCode !== 0) process.exit(build.exitCode ?? 1)

	// Drop the emitted pglite asset copies (`pglite-<hash>.wasm/.data`) — see above: unread on the node
	// path, and pglite's real assets travel in dist/node_modules. Keeps dist/ (and the Docker image) lean.
	for (const name of await readdir(distDir)) {
		if (/^pglite-.*\.(wasm|data)$/.test(name)) await rm(join(distDir, name))
	}

	// Stage the migrations next to the bundle so the rewritten `import.meta.url` fallback resolves.
	await cp(contractsMigrations, join(distDir, 'migrations'), { recursive: true })

	// Stage the external PGlite package (JS + WASM/.data assets) into dist/node_modules so the Node
	// walk-up from dist/server.js resolves it. `dereference` turns the .bun-store symlink into real
	// files that travel with the bundle.
	await cp(resolvePgliteRoot(), join(distDir, 'node_modules/@electric-sql/pglite'), {
		recursive: true,
		dereference: true,
	})

	console.log('✅ node bundle built → dist/server.js (+ dist/migrations + dist/node_modules/@electric-sql/pglite)')
}

main().catch(error => {
	console.error('❌ build failed:', error)
	process.exit(1)
})
