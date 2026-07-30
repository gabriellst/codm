/**
 * Build the sidecar binaries Tauri bundles via `bundle.externalBin` — DRIVEN BY THE PACKAGE
 * SIDECAR MANIFEST (./sidecars.ts, SIDECARS): binary roles, source workspaces (cwd), entries,
 * and build kinds all come from the manifest; this script owns only the host-triple knowledge
 * and the spawn loop. `REPO` is read only for the brand (binary-name prefix) and workspace roots.
 *
 * Tauri resolves external binaries by `<name>-<target-triple>` next to src-tauri,
 * so outputs land in src-tauri/binaries/ with the host triple suffix.
 *
 * Shipping a SQLite engine inside a bun single-binary uses the same walk-up mechanism the D2 spike
 * proved (.specs/codedm/2026-07-23-fork-d2-spike.md), with a different package: `@libsql/client`
 * bottoms out in `libsql`, which loads a Neon/N-API prebuild through `@neon-rs/load` — a dynamic
 * `require` of the HOST TRIPLE package that no bundler can follow. Bun compiles the JS closure into
 * the binary; that one require is resolved at RUNTIME from the process CWD, never from the
 * executable's directory. So the prebuild is STAGED beside the binary (`DAEMON_RUNTIME` below) and
 * the shell spawns the sidecar inside that dir (`Sidecar.cwd` in src/sidecars/mod.rs). A build alone
 * never surfaces this: the binary compiles clean and dies on first connect.
 */
import { cpSync, existsSync, mkdirSync, rmSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { REPO } from '../../../../template.config'
import { SIDECARS, type SidecarManifestEntry } from './sidecars'

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
 * The daemon's staged runtime dir — the ONE thing a compiled bun binary still resolves from disk.
 * Explicit, like `MIGRATIONS_RESOURCE` in ./generate.ts, and mirrored in exactly three places: here
 * (what gets staged), `./generate.ts` (`bundle.resources`, so it reaches the app resource dir) and
 * `../src-tauri/src/sidecars/mod.rs` (`Sidecar.cwd`, so the daemon is spawned inside it).
 *
 * `packages` names the ENTRY package (`@libsql/client`), never `libsql` and never the host triple:
 * the closure walk below stages everything below the entry, and only the entry is resolvable from a
 * workspace — `libsql` itself lives one level down in the store and does not resolve from here
 * (measured). `resolveFrom` is load-bearing too: the dep is declared by the nested `core` package,
 * so it resolves from `<workspace>/core` and NOWHERE above.
 */
const DAEMON_RUNTIME = {
	role: 'daemon',
	subpath: 'daemon-runtime',
	resolveFrom: 'core',
	packages: ['@libsql/client'],
} as const

/**
 * Build command per declared kind — the manifest names the kind, this maps it to a toolchain.
 *
 * ⚠️ `bun-compile` takes NO `--external`, and that is a measured decision, not an omission. Marking
 * the libsql packages external makes bun leave their JS on disk; the compiled binary then resolves
 * the top-level specifier from the CWD but FAILS on that module's own nested `require`s — measured
 * on bun 1.3.14: `Cannot find module '@neon-rs/load' from '<staged>/node_modules/libsql/index.js'`,
 * even with `@neon-rs/load` nested correctly beside it. Bundling the whole JS closure works; only
 * the native prebuild (a dynamic require of the host triple) still has to sit on disk, which is
 * what `DAEMON_RUNTIME` + the Rust `cwd` cover.
 */
function buildCmd(sidecar: SidecarManifestEntry, outfile: string): string[] {
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
 * (`@libsql/darwin-arm64`, …) is an optional dep of `libsql`, and walking it is what keeps this file
 * from naming a triple. Absent optionals are the OTHER platforms' prebuilds — skipped, not an error.
 * `dependencies` are walked too so a staged package is never half-copied. `@types/*` are type-only
 * and skipped.
 *
 * ⚠️ CROSS-TRIPLE GAP: `HOST_TRIPLES` only ever builds for the host and `bun install` only fetches
 * the host's optional prebuild, so a CI cross-build produces a binary that COMPILES and then dies at
 * runtime with a missing `@libsql/<other-triple>`. Fixing that needs per-target prebuild fetching,
 * not a change here.
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
	for (const sidecar of SIDECARS) {
		const name = `${REPO.brand}-${sidecar.role}`
		const outfile = join(outDir, `${name}-${triple}${exe}`)
		const cwd = join(repoRoot, REPO.workspaces[sidecar.build.workspace].pkgRoot)
		await run(name, buildCmd(sidecar, outfile), cwd)
		outputs.push(`${name}-${triple}${exe}`)
	}

	for (const name of outputs) {
		if (!existsSync(join(outDir, name))) {
			console.error(`[sidecars] expected output missing: ${name}`)
			process.exit(1)
		}
	}

	// Stage the assets a compiled sidecar can't inline. FIRST: the Drizzle migrations. A
	// `bun build --compile` binary has no node_modules and the migration applier reads the folder via
	// node fs (which can't walk the `/$bunfs` virtual FS), so the migrations travel as a bundle
	// resource. Staged under `binaries/migrations`; tauri.conf `bundle.resources` (generated) copies
	// it to the app resource dir at `migrations`, and the daemon's inline `CODM_MIGRATIONS_DIR`
	// (src/sidecars/mod.rs) resolves `resource_dir/migrations` at runtime. One explicit path, mirrored
	// in generate.ts (MIGRATIONS_RESOURCE) + mod.rs. Source is the canonical contracts migrations
	// output — the SQLite one, the source of truth for BOTH the TS daemon and the Go gateway.
	const contractsMigrations = join(
		repoRoot,
		REPO.workspaces.contracts.pkgRoot,
		'db',
		'schema',
		'migrations',
	)
	const migrationsDest = join(outDir, 'migrations')
	rmSync(migrationsDest, { recursive: true, force: true })
	cpSync(contractsMigrations, migrationsDest, { recursive: true })
	if (!existsSync(migrationsDest)) {
		console.error('[sidecars] failed to stage migrations resource: migrations')
		process.exit(1)
	}
	console.log('[sidecars] staged migrations → src-tauri/binaries/migrations/')

	// SECOND: the daemon's native-prebuild closure (see DAEMON_RUNTIME). Resolved from the daemon
	// sidecar's own workspace, copied FLAT into `binaries/daemon-runtime/node_modules/<pkg>` so the
	// binary's CWD walk-up finds the entry point AND every sibling it requires. `dereference` turns
	// the .bun-store symlinks into real files that survive bundling.
	const daemon = SIDECARS.find(s => s.role === DAEMON_RUNTIME.role)
	if (daemon === undefined) {
		console.error(`[sidecars] DAEMON_RUNTIME names unknown sidecar role '${DAEMON_RUNTIME.role}'`)
		process.exit(1)
	}
	const resolveFrom = join(
		repoRoot,
		REPO.workspaces[daemon.build.workspace].pkgRoot,
		DAEMON_RUNTIME.resolveFrom,
	)
	const runtimeDest = join(outDir, DAEMON_RUNTIME.subpath, 'node_modules')
	rmSync(runtimeDest, { recursive: true, force: true })
	const roots = resolveStagedRoots(DAEMON_RUNTIME.packages, resolveFrom)
	for (const [name, root] of roots) {
		cpSync(root, join(runtimeDest, name), { recursive: true, dereference: true })
		if (!existsSync(join(runtimeDest, name))) {
			console.error(`[sidecars] failed to stage node module '${name}' into ${DAEMON_RUNTIME.subpath}`)
			process.exit(1)
		}
	}
	console.log(
		`[sidecars] staged ${roots.size} node modules → src-tauri/binaries/${DAEMON_RUNTIME.subpath}/node_modules/`,
	)

	// THIRD: purge the CARGO-SIDE copies of the two dirs above. `tauri dev` copies each
	// `bundle.resources` entry from `binaries/<subpath>` into `target/<profile>/<subpath>`, and that
	// copy is ADDITIVE — it overwrites same-named files and leaves everything else in place. The
	// `rmSync`es above keep `binaries/` honest but do not reach the destination, so a file that has
	// since been deleted upstream lives on in the build dir forever.
	//
	// That is not hypothetical. This repo's migrations moved from Postgres to SQLite, and ten
	// pre-move PG files (`CREATE SCHEMA "artifact"`, …) survived in `target/debug/migrations`
	// alongside the three real ones. The applier derives its set from `readdir | filter .sql | sort`,
	// so it found thirteen files and tried to apply `0000_condemned_brother_voodoo.sql` FIRST — it
	// sorts ahead of `0000_flaky_carmella_unuscione.sql`. The daemon died on
	// `SQLITE_ERROR: near "SCHEMA"` before opening its port, and because the supervisor reports a
	// sidecar's death through a `sidecar:error` event rather than the terminal, the desktop app just
	// came up with no daemon and no message.
	//
	// Deleting a derived copy is safe: the next `tauri dev`/`tauri build` re-copies from `binaries/`,
	// which is authoritative and was just rebuilt.
	for (const profile of ['debug', 'release']) {
		for (const subpath of ['migrations', DAEMON_RUNTIME.subpath]) {
			const derived = join(pkgRoot, 'src-tauri', 'target', profile, subpath)
			if (existsSync(derived)) {
				rmSync(derived, { recursive: true, force: true })
				console.log(`[sidecars] purged stale cargo-side copy → target/${profile}/${subpath}/`)
			}
		}
	}

	console.log(`[sidecars] done → src-tauri/binaries/ (${triple})`)
}

// Run as a standalone script (`bun config/build-sidecars.ts`) — the package "sidecars" script and
// the nx `sidecars` target both invoke it this way. Importing the module (e.g. for SIDECARS types)
// does NOT trigger a build.
if (import.meta.main) {
	await buildSidecars()
}
