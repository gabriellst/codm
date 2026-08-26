/**
 * Build the sidecar binaries Tauri bundles via `bundle.externalBin` — DRIVEN BY THE PACKAGE
 * SIDECAR MANIFEST (./sidecars.ts, SIDECARS): binary roles, source workspaces (cwd), entries,
 * and build kinds all come from the manifest; this script owns only the target-toolchain
 * knowledge (TARGETS) and the spawn loop. `REPO` is read only for the brand (binary-name prefix)
 * and workspace roots.
 *
 * Tauri resolves external binaries by `<name>-<target-triple>`, so outputs land in
 * `src-tauri/binaries/` with the TARGET triple suffix.
 *
 * `bun config/build-sidecars.ts` — NO ARGUMENTS: every build targets the HOST, and the host's own
 * row in TARGETS supplies the triple, the bun `--compile --target=`, and the Go `GOOS`/`GOARCH`.
 * The script had a `--target <key>` cross mode between 2026-08-25 and 2026-08-26, when the Windows
 * release leg was cross-compiled from a Linux runner (`cargo-xwin`) because hosted-runner billing
 * was unavailable. The repo went public, hosted runners became free on all three OSes, every leg
 * builds natively again, and the cross mode lost its only consumer — so it is gone rather than
 * rotting unexercised. Unknown arguments are REJECTED (`main` below) instead of silently ignored:
 * a stale `--target win32-x64` from an old doc or script must fail, not quietly build for the host.
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
import { cpSync, existsSync, mkdirSync, readFileSync, rmSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { REPO } from '../../../../template.config'
import { SIDECARS, type SidecarManifestEntry } from './sidecars'

/**
 * Toolchain knowledge per declared target — platform data, not repo identity (correctly local).
 * ONE table for everything a target changes: the Tauri/Rust triple suffix, the target's own
 * platform/arch, the bun `--compile --target=` value, and the Go `GOOS`/`GOARCH` pair. Every build
 * targets the host, but the call sites still read the ROW rather than `process.platform`/
 * `process.arch` directly: one lookup decides the triple, the `.exe` suffix and both toolchains, so
 * a new host (linux-arm64, say) is one row here and never an `if` at a call site.
 */
export interface TargetSpec {
	/** Rust-style target triple — the `<name>-<triple>` suffix Tauri's `externalBin` expects. */
	triple: string
	/** The TARGET's platform, in Node's `process.platform` vocabulary. */
	platform: 'darwin' | 'linux' | 'win32'
	/** The TARGET's CPU, in Node's `process.arch` vocabulary. */
	arch: 'arm64' | 'x64'
	/** `bun build --compile --target=<val>` — bun's cross-compile target name for this platform+arch. */
	bunTarget: string
	/** `go build` cross-compile env for this target. CGO stays whatever the toolchain defaults to —
	 *  both sidecars are pure (no cgo), so nothing here should ever need a C cross-compiler. */
	go: { GOOS: string; GOARCH: string }
}

export const TARGETS = {
	'darwin-arm64': {
		triple: 'aarch64-apple-darwin',
		platform: 'darwin',
		arch: 'arm64',
		bunTarget: 'bun-darwin-arm64',
		go: { GOOS: 'darwin', GOARCH: 'arm64' },
	},
	'darwin-x64': {
		triple: 'x86_64-apple-darwin',
		platform: 'darwin',
		arch: 'x64',
		bunTarget: 'bun-darwin-x64',
		go: { GOOS: 'darwin', GOARCH: 'amd64' },
	},
	'linux-arm64': {
		triple: 'aarch64-unknown-linux-gnu',
		platform: 'linux',
		arch: 'arm64',
		bunTarget: 'bun-linux-arm64',
		go: { GOOS: 'linux', GOARCH: 'arm64' },
	},
	'linux-x64': {
		triple: 'x86_64-unknown-linux-gnu',
		platform: 'linux',
		arch: 'x64',
		bunTarget: 'bun-linux-x64',
		go: { GOOS: 'linux', GOARCH: 'amd64' },
	},
	'win32-x64': {
		triple: 'x86_64-pc-windows-msvc',
		platform: 'win32',
		arch: 'x64',
		bunTarget: 'bun-windows-x64',
		go: { GOOS: 'windows', GOARCH: 'amd64' },
	},
} as const satisfies Record<string, TargetSpec>

export type TargetKey = keyof typeof TARGETS

export function isTargetKey(value: string): value is TargetKey {
	return Object.hasOwn(TARGETS, value)
}

/** `${platform}-${arch}` in the SAME vocabulary TARGETS keys use — the host's own row when it has one. */
export function resolveHostKey(platform: string, arch: string): string {
	return `${platform}-${arch}`
}

/**
 * The build target IS the host — but the host must be a declared TARGETS row, or there is no
 * triple, no bun target and no `GOOS` to build with. Fails loud naming the host instead of
 * half-building with defaults.
 *
 * Also the argv guard: this script takes NO arguments. Anything passed is a caller still speaking
 * the retired `--target` protocol (the cross mode that existed only while the Windows release leg
 * was cross-compiled from Linux), and silently building for the host would hand it a binary for the
 * wrong platform under the right name.
 */
export function resolveTargetKey(argv: readonly string[], hostKey: string): TargetKey {
	if (argv.length > 0) {
		throw new Error(`this script takes no arguments (got: ${argv.join(' ')}) — every build targets the host`)
	}
	if (!isTargetKey(hostKey)) {
		throw new Error(`unsupported host ${hostKey} — add it to TARGETS`)
	}
	return hostKey
}

async function run(label: string, cmd: string[], cwd: string, env?: Record<string, string>): Promise<void> {
	console.log(`[sidecars] ${label}: ${cmd.join(' ')}`)
	const proc = Bun.spawn(cmd, {
		cwd,
		stdout: 'inherit',
		stderr: 'inherit',
		...(env ? { env: { ...process.env, ...env } } : {}),
	})
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
 * `packages` names the ENTRY package (`@libsql/client`), never `libsql` and never a host/target
 * triple: the closure walk below stages everything below the entry, and only the entry is
 * resolvable from a workspace — `libsql` itself lives one level down in the store and does not
 * resolve from here (measured). `resolveFrom` (host path) is load-bearing too: the dep is declared
 * by the nested `core` package, so it resolves from `<workspace>/core` and NOWHERE above.
 *
 * `nativePrebuild` is the OTHER declared table: libsql's native-prebuild optional-dep name per
 * target, keyed the SAME as TARGETS (the `satisfies` below makes a target added to TARGETS without
 * a row here a tsc error — total by construction, same discipline as TARGETS itself). Not derived
 * from the triple string: Linux ships BOTH gnu/musl prebuilds and this repo standardizes on gnu,
 * matching TARGETS' own `...-unknown-linux-gnu` triple. It is read twice — by the staging walk's
 * filter (below) and by the post-staging assertion in `buildSidecars`, which fails loud when the
 * host's prebuild did not land (a daemon missing it compiles clean and dies on first connect).
 *
 * That same table drives the staging walk's filter (`shouldStageOptionalDependency`, below
 * `resolveStagedRoots`): `bun install`'s os/cpu matching resolves every libc variant for a given
 * os+cpu (no libc axis in its optional-dep gate), so a linux-x64-gnu HOST resolves
 * `@libsql/linux-x64-musl` too — the walk used to stage it right alongside gnu, and `ldd` on the
 * musl `.node` then killed linuxdeploy. The filter keys off THIS table so the fix stays declarative
 * (add a target here, the filter covers it) instead of a platform `if` at the staging call site.
 */
export const DAEMON_RUNTIME = {
	role: 'daemon',
	subpath: 'daemon-runtime',
	resolveFrom: 'core',
	packages: ['@libsql/client'],
	nativePrebuild: {
		'darwin-arm64': '@libsql/darwin-arm64',
		'darwin-x64': '@libsql/darwin-x64',
		'linux-arm64': '@libsql/linux-arm64-gnu',
		'linux-x64': '@libsql/linux-x64-gnu',
		'win32-x64': '@libsql/win32-x64-msvc',
	},
} as const satisfies {
	role: string
	subpath: string
	resolveFrom: string
	packages: readonly string[]
	nativePrebuild: Record<TargetKey, string>
}

/**
 * Build command per declared kind — the manifest names the kind, this maps it to a toolchain, for
 * the given target row (uniformly — never an `if (target === 'win32-x64')` here).
 *
 * ⚠️ `bun-compile` takes NO `--external`, and that is a measured decision, not an omission. Marking
 * the libsql packages external makes bun leave their JS on disk; the compiled binary then resolves
 * the top-level specifier from the CWD but FAILS on that module's own nested `require`s — measured
 * on bun 1.3.14: `Cannot find module '@neon-rs/load' from '<staged>/node_modules/libsql/index.js'`,
 * even with `@neon-rs/load` nested correctly beside it. Bundling the whole JS closure works; only
 * the native prebuild (a dynamic require of the host triple) still has to sit on disk, which is
 * what `DAEMON_RUNTIME` + the Rust `cwd` cover.
 */
export function buildCmd(sidecar: SidecarManifestEntry, outfile: string, target: TargetSpec): { cmd: string[]; env?: Record<string, string> } {
	switch (sidecar.build.kind) {
		case 'bun-compile':
			return { cmd: ['bun', 'build', '--compile', `--target=${target.bunTarget}`, sidecar.build.entry, '--outfile', outfile] }
		case 'go-build':
			return {
				cmd: ['go', 'build', '-o', outfile, sidecar.build.entry],
				env: { GOOS: target.go.GOOS, GOARCH: target.go.GOARCH },
			}
	}
}

/**
 * Pure classifier for the (B) walk-filter below: given the FULL set of optional-dependency names
 * declared by ONE package (e.g. `libsql`'s own `optionalDependencies`), decide whether that set IS
 * the native-prebuild family — true when it contains at least one of `nativePrebuild`'s declared
 * VALUES. Detecting the family this way (co-occurrence in the SAME `optionalDependencies` object as
 * a package we already declared) is what lets an UNDECLARED sibling (`@libsql/linux-x64-musl` —
 * musl is real but this repo only ever targets glibc, see `DAEMON_RUNTIME.nativePrebuild`'s own
 * comment) still be recognized as part of the family it travels with, with zero platform `if`s and
 * zero string-shape guessing on the package name itself.
 */
export function isNativePrebuildFamily(optionalDepNames: readonly string[], nativePrebuild: Record<TargetKey, string>): boolean {
	const declared = new Set(Object.values(nativePrebuild))
	return optionalDepNames.some(name => declared.has(name))
}

/**
 * Pure walk-filter for defect (B): should `depName` — one member of `allOptionalDepNames`, the
 * FULL optional-dependency set of its declaring package — be staged for `targetKey`?
 *
 * - Not a native-prebuild family member (`isNativePrebuildFamily` is false for its siblings) ⇒
 *   today's behavior, unchanged: always a staging candidate (still gated on actually resolving).
 * - A family member ⇒ staged ONLY when it's the ONE package `nativePrebuild[targetKey]` names.
 *   This is the fix: measured on a linux-x64-gnu host, `bun install`'s os/cpu matching resolves
 *   BOTH `@libsql/linux-x64-gnu` AND `@libsql/linux-x64-musl` (bun's optional-dep gate has no libc
 *   axis), so the old walk staged the musl prebuild into a glibc bundle — `ldd` on the musl `.node`
 *   then dies inside linuxdeploy. A HOST-path defect, and it stays fixed here regardless of which
 *   platform the build is running on.
 */
export function shouldStageOptionalDependency(
	depName: string,
	allOptionalDepNames: readonly string[],
	targetKey: TargetKey,
	nativePrebuild: Record<TargetKey, string>,
): boolean {
	if (!isNativePrebuildFamily(allOptionalDepNames, nativePrebuild)) return true
	return depName === nativePrebuild[targetKey]
}

/**
 * Runtime closure of a declared package, resolved FROM the host workspace. Walking
 * `optionalDependencies` is the POINT, not a nicety: the native prebuild (`@libsql/darwin-arm64`, …)
 * is an optional dep of `libsql`, and walking it is what keeps this file from naming a triple at the
 * call site. Absent optionals are the OTHER platforms' prebuilds — skipped, not an error.
 * `dependencies` are walked too so a staged package is never half-copied. `@types/*` are type-only
 * and skipped. Every optional dep is additionally run through `shouldStageOptionalDependency`
 * (defect B, see its own doc) BEFORE the resolve attempt — a family member that isn't this target's
 * declared prebuild is skipped outright, never even probed.
 *
 * CROSS-TRIPLE GAP — why every release leg builds on its own OS. `bun install`'s ambient
 * node_modules only ever holds the HOST's optional prebuild, so a closure walked here for a
 * DIFFERENT platform would stage a daemon that compiles clean and then dies at runtime with a
 * missing `@libsql/<target-triple>`. There was a cross path around this (a throwaway
 * `bun install --os --cpu` scratch root) while the Windows release leg was cross-compiled from
 * Linux; with hosted runners free on all three OSes, every leg builds natively and the workspace
 * closure is the right one by construction. `DAEMON_RUNTIME.nativePrebuild` is still asserted after
 * staging, so a silent miss fails the build loud instead of shipping a binary that dies on first
 * connect.
 */
function resolveStagedRoots(
	packages: readonly string[],
	resolveFrom: string,
	targetKey: TargetKey,
	nativePrebuild: Record<TargetKey, string> = DAEMON_RUNTIME.nativePrebuild,
): Map<string, string> {
	const roots = new Map<string, string>()

	function walk(name: string, resolveFrom: string): void {
		if (roots.has(name) || name.startsWith('@types/')) return
		const pkgJsonPath = Bun.resolveSync(`${name}/package.json`, resolveFrom)
		const pkgDir = dirname(pkgJsonPath)
		roots.set(name, pkgDir)
		const manifest = JSON.parse(readFileSync(pkgJsonPath, 'utf-8')) as {
			dependencies?: Record<string, string>
			optionalDependencies?: Record<string, string>
		}
		for (const dep of Object.keys(manifest.dependencies ?? {})) walk(dep, pkgDir)
		const optionalDepNames = Object.keys(manifest.optionalDependencies ?? {})
		for (const dep of optionalDepNames) {
			if (!shouldStageOptionalDependency(dep, optionalDepNames, targetKey, nativePrebuild)) continue
			try {
				Bun.resolveSync(`${dep}/package.json`, pkgDir)
			} catch {
				continue
			}
			walk(dep, pkgDir)
		}
	}

	for (const name of packages) walk(name, resolveFrom)
	return roots
}

export async function buildSidecars(targetKey: TargetKey): Promise<void> {
	const target = TARGETS[targetKey]

	const pkgRoot = join(import.meta.dir, '..')
	const repoRoot = join(pkgRoot, '..', '..', '..')
	const outDir = join(pkgRoot, 'src-tauri', 'binaries')
	mkdirSync(outDir, { recursive: true })
	// The target ROW's own extension — one lookup decides it, like every other toolchain fact here.
	const exe = target.platform === 'win32' ? '.exe' : ''

	const outputs: string[] = []
	for (const sidecar of SIDECARS) {
		const name = `${REPO.brand}-${sidecar.role}`
		const outfile = join(outDir, `${name}-${target.triple}${exe}`)
		const cwd = join(repoRoot, REPO.workspaces[sidecar.build.workspace].pkgRoot)
		const { cmd, env } = buildCmd(sidecar, outfile, target)
		await run(name, cmd, cwd, env)
		outputs.push(`${name}-${target.triple}${exe}`)
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
	// Target-independent: migrations are data, not a compiled artifact.
	const contractsMigrations = join(repoRoot, REPO.workspaces.contracts.pkgRoot, 'src', 'db', 'sqlite', 'migrations')
	const migrationsDest = join(outDir, 'migrations')
	rmSync(migrationsDest, { recursive: true, force: true })
	cpSync(contractsMigrations, migrationsDest, { recursive: true })
	if (!existsSync(migrationsDest)) {
		console.error('[sidecars] failed to stage migrations resource: migrations')
		process.exit(1)
	}
	console.log('[sidecars] staged migrations → src-tauri/binaries/migrations/')

	// SECOND: the daemon's native-prebuild closure (see DAEMON_RUNTIME). Resolved from the daemon
	// sidecar's own workspace — the host's own node_modules, which is exactly the closure this host's
	// binary needs (see the CROSS-TRIPLE GAP note above for why that sentence is the whole reason
	// each release leg builds on its own OS). Copied FLAT into
	// `binaries/daemon-runtime/node_modules/<pkg>` so the binary's CWD walk-up finds the entry point
	// AND every sibling it requires. `dereference` turns the .bun-store symlinks into real files that
	// survive bundling.
	const daemon = SIDECARS.find(s => s.role === DAEMON_RUNTIME.role)
	if (daemon === undefined) {
		console.error(`[sidecars] DAEMON_RUNTIME names unknown sidecar role '${DAEMON_RUNTIME.role}'`)
		process.exit(1)
		return
	}
	const coreDir = join(repoRoot, REPO.workspaces[daemon.build.workspace].pkgRoot, DAEMON_RUNTIME.resolveFrom)
	const runtimeDest = join(outDir, DAEMON_RUNTIME.subpath, 'node_modules')
	rmSync(runtimeDest, { recursive: true, force: true })

	const roots = resolveStagedRoots(DAEMON_RUNTIME.packages, coreDir, targetKey)
	for (const [name, root] of roots) {
		cpSync(root, join(runtimeDest, name), { recursive: true, dereference: true })
		if (!existsSync(join(runtimeDest, name))) {
			console.error(`[sidecars] failed to stage node module '${name}' into ${DAEMON_RUNTIME.subpath}`)
			process.exit(1)
		}
	}
	console.log(`[sidecars] staged ${roots.size} node modules → src-tauri/binaries/${DAEMON_RUNTIME.subpath}/node_modules/`)

	// Staged-prebuild sanity: a closure that copied fine can still be missing the ONE package that
	// actually opens the database, if the optional-dep filter silently matched nothing (a libsql
	// release that drops a platform, an install that never fetched it). Fail loud, naming the gap,
	// instead of shipping a sidecar that dies on first connect.
	const expectedNativePkg = DAEMON_RUNTIME.nativePrebuild[targetKey]
	if (!existsSync(join(runtimeDest, expectedNativePkg))) {
		console.error(
			`[sidecars] staging gap: '${expectedNativePkg}' missing from ${DAEMON_RUNTIME.subpath}/node_modules — the ${targetKey} daemon would compile clean and die on first connect`,
		)
		process.exit(1)
	}

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

	console.log(`[sidecars] done → src-tauri/binaries/ (${target.triple})`)
}

// Run as a standalone script (`bun config/build-sidecars.ts`, no arguments) — the package
// "sidecars" script, the nx `sidecars` target and the release workflows all invoke it this way.
// Importing the module (e.g. for SIDECARS/TARGETS types, or the pure helpers under test) does NOT
// trigger a build.
if (import.meta.main) {
	try {
		const hostKey = resolveHostKey(process.platform, process.arch)
		const targetKey = resolveTargetKey(process.argv.slice(2), hostKey)
		await buildSidecars(targetKey)
	} catch (err) {
		console.error(`[sidecars] ${err instanceof Error ? err.message : String(err)}`)
		process.exit(1)
	}
}
