/**
 * Build the sidecar binaries Tauri bundles via `bundle.externalBin` — DRIVEN BY THE
 * DESKTOP CONTRACT (template.config.ts REPO.desktop.sidecars): binary names, source
 * workspaces (cwd), entries, and build kinds all come from the contract; this script
 * owns only the host-triple knowledge and the spawn loop.
 *
 * Tauri resolves external binaries by `<name>-<target-triple>` next to src-tauri,
 * so outputs land in src-tauri/binaries/ with the host triple suffix.
 *
 * Shipping a SQLite engine inside a bun single-binary uses the same walk-up mechanism the D2 spike
 * proved (.specs/codedm/2026-07-23-fork-d2-spike.md), with a different package: `@libsql/client`
 * bottoms out in `libsql`, which loads a Neon/N-API prebuild through `@neon-rs/load` — a dynamic
 * `require` of the HOST TRIPLE package that no bundler can follow. Bun compiles the JS closure into
 * the binary; that one require is resolved at RUNTIME from the process CWD, never from the
 * executable's directory. So the prebuild is STAGED beside the binary (`stageNodeModules`) and the
 * shell spawns the sidecar inside that dir (the contract's `cwd` slot → `.current_dir()`). A build
 * alone never surfaces this: the binary compiles clean and dies on first connect.
 */
import { cpSync, existsSync, mkdirSync, rmSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { REPO, type SidecarDecl } from '../../../../template.config'

// Genuine toolchain knowledge — platform data, not repo identity (correctly local).
const HOST_TRIPLES: Record<string, string> = {
	'darwin-arm64': 'aarch64-apple-darwin',
	'darwin-x64': 'x86_64-apple-darwin',
	'linux-arm64': 'aarch64-unknown-linux-gnu',
	'linux-x64': 'x86_64-unknown-linux-gnu',
	'win32-x64': 'x86_64-pc-windows-msvc',
}

async function run(label: string, cmd: string[], cwd: string): Promise<void> {
	console.log(`[sidecars] ${label}: ${cmd.join(' ')}`)
	const proc = Bun.spawn(cmd, { cwd, stdout: 'inherit', stderr: 'inherit' })
	const code = await proc.exited
	if (code !== 0) {
		console.error(`[sidecars] ${label} failed (exit ${code})`)
		process.exit(code)
	}
}

/**
 * Build command per declared kind — the contract names the kind, this maps it to a toolchain.
 *
 * ⚠️ `bun-compile` takes NO `--external`, and that is a measured decision, not an omission. Marking
 * the libsql packages external makes bun leave their JS on disk; the compiled binary then resolves
 * the top-level specifier from the CWD but FAILS on that module's own nested `require`s — measured
 * on bun 1.3.14: `Cannot find module '@neon-rs/load' from '<staged>/node_modules/libsql/index.js'`,
 * even with `@neon-rs/load` nested correctly beside it. Bundling the whole JS closure works; only
 * the native prebuild (a dynamic require of the host triple) still has to sit on disk, which is
 * what `stageNodeModules` + `cwd` cover.
 */
function buildCmd(sidecar: SidecarDecl, outfile: string): string[] {
	switch (sidecar.build.kind) {
		case 'bun-compile':
			return ['bun', 'build', '--compile', sidecar.build.entry, '--outfile', outfile]
		case 'go-build':
			return ['go', 'build', '-o', outfile, sidecar.build.entry]
	}
}

/**
 * Runtime closure of a declared package, resolved from the sidecar's own workspace (where the dep is
 * symlinked). Walking `optionalDependencies` is the POINT, not a nicety: the host-triple prebuild
 * (`@libsql/darwin-arm64`, …) is an optional dep of `libsql`, and walking it is what keeps the
 * contract from naming a triple. Absent optionals are the OTHER platforms' prebuilds — skipped, not
 * an error. `dependencies` are walked too so a staged package is never half-copied. `@types/*` are
 * type-only and skipped.
 *
 * ⚠️ CROSS-TRIPLE GAP (open question 7): `HOST_TRIPLES` only ever builds for the host and
 * `bun install` only fetches the host's optional prebuild, so a CI cross-build produces a binary
 * that COMPILES and then dies at runtime with a missing `@libsql/<other-triple>`. Fixing that needs
 * per-target prebuild fetching, not a change here.
 */
function resolveStagedRoots(packages: readonly string[], fromDir: string): Map<string, string> {
	const roots = new Map<string, string>()

	function walk(name: string, resolveFrom: string): void {
		if (roots.has(name) || name.startsWith('@types/')) return
		const pkgJsonPath = Bun.resolveSync(`${name}/package.json`, resolveFrom)
		const pkgDir = dirname(pkgJsonPath)
		roots.set(name, pkgDir)
		const manifest = require(pkgJsonPath) as {
			dependencies?: Record<string, string>
			optionalDependencies?: Record<string, string>
		}
		for (const dep of Object.keys(manifest.dependencies ?? {})) walk(dep, pkgDir)
		for (const dep of Object.keys(manifest.optionalDependencies ?? {})) {
			try {
				Bun.resolveSync(`${dep}/package.json`, pkgDir)
			} catch {
				continue
			}
			walk(dep, pkgDir)
		}
	}

	for (const name of packages) walk(name, fromDir)
	return roots
}

export async function buildSidecars(): Promise<void> {
	const hostKey = `${process.platform}-${process.arch}`
	const triple = HOST_TRIPLES[hostKey]
	if (!triple) {
		console.error(`[sidecars] unsupported host ${hostKey} — add it to HOST_TRIPLES`)
		process.exit(1)
	}

	const pkgRoot = join(import.meta.dir, '..')
	const repoRoot = join(pkgRoot, '..', '..', '..')
	const outDir = join(pkgRoot, 'src-tauri', 'binaries')
	mkdirSync(outDir, { recursive: true })
	const exe = process.platform === 'win32' ? '.exe' : ''

	const outputs: string[] = []
	for (const sidecar of REPO.desktop.sidecars) {
		const name = `${REPO.brand}-${sidecar.role}`
		const outfile = join(outDir, `${name}-${triple}${exe}`)
		const cwd = join(repoRoot, REPO.workspaces[sidecar.workspace].pkgRoot)
		await run(name, buildCmd(sidecar, outfile), cwd)
		outputs.push(`${name}-${triple}${exe}`)
	}

	for (const name of outputs) {
		if (!existsSync(join(outDir, name))) {
			console.error(`[sidecars] expected output missing: ${name}`)
			process.exit(1)
		}
	}

	// Stage assets a compiled sidecar can't inline. First: the Drizzle migrations. A
	// `bun build --compile` binary has no node_modules and the migration applier reads the folder via
	// node fs (which can't walk the `/$bunfs` virtual FS), so the migrations must travel as a bundle
	// resource. Every `resourceDir` boot-env `subpath` is materialized under `binaries/<subpath>`;
	// tauri.conf `bundle.resources` (generated) copies it to the app resource dir, and the daemon's
	// CODEDM_MIGRATIONS_DIR resolves `resource_dir/<subpath>` at runtime. The standalone daemon boot is
	// pointed straight at this staged dir. Source is the canonical contracts migrations output — the
	// SQLite one, which is the source of truth for BOTH the TS daemon and the Go gateway.
	const contractsMigrations = join(
		repoRoot,
		REPO.workspaces.contracts.pkgRoot,
		'db',
		'schema-sqlite',
		'migrations',
	)
	const stagedSubpaths = new Set<string>()
	for (const sidecar of REPO.desktop.sidecars) {
		for (const source of Object.values(sidecar.bootEnv)) {
			if ('from' in source && source.from === 'resourceDir') stagedSubpaths.add(source.subpath)
		}
	}
	for (const subpath of stagedSubpaths) {
		const dest = join(outDir, subpath)
		rmSync(dest, { recursive: true, force: true })
		cpSync(contractsMigrations, dest, { recursive: true })
		if (!existsSync(dest)) {
			console.error(`[sidecars] failed to stage migrations resource: ${subpath}`)
			process.exit(1)
		}
		console.log(`[sidecars] staged migrations → src-tauri/binaries/${subpath}/`)
	}

	// Second: the `external` module closures. Declared per sidecar (`stageNodeModules`), resolved from
	// that sidecar's own workspace, copied FLAT into `binaries/<subpath>/node_modules/<pkg>` so the
	// binary's CWD walk-up finds the entry point AND every sibling it requires. `dereference` turns
	// the .bun-store symlinks into real files that survive bundling.
	for (const sidecar of REPO.desktop.sidecars) {
		const staged = sidecar.stageNodeModules
		if (staged === undefined) continue
		const resolveFrom = join(
			repoRoot,
			REPO.workspaces[sidecar.workspace].pkgRoot,
			staged.resolveFrom ?? '.',
		)
		const dest = join(outDir, staged.subpath, 'node_modules')
		rmSync(dest, { recursive: true, force: true })
		const roots = resolveStagedRoots(staged.packages, resolveFrom)
		for (const [name, root] of roots) {
			cpSync(root, join(dest, name), { recursive: true, dereference: true })
			if (!existsSync(join(dest, name))) {
				console.error(`[sidecars] failed to stage node module '${name}' into ${staged.subpath}`)
				process.exit(1)
			}
		}
		console.log(
			`[sidecars] staged ${roots.size} node modules → src-tauri/binaries/${staged.subpath}/node_modules/`,
		)
	}

	console.log(`[sidecars] done → src-tauri/binaries/ (${triple})`)
}

// Run as a standalone script (`bun sidecars/build.ts`) — the package "sidecars" script and the
// nx `sidecars` target both invoke it this way. Importing the module (e.g. via `./index.ts` for
// its exported types) does NOT trigger a build.
if (import.meta.main) {
	await buildSidecars()
}
