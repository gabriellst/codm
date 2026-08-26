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
 * `bun config/build-sidecars.ts [--target <key>]` — `<key>` is a declared key of TARGETS (closed
 * set, rejected otherwise). No flag = build for the host, exactly as before this file learned to
 * cross-compile. A `--target` naming a DIFFERENT platform than the host cross-compiles: the bun
 * sidecar via `bun build --compile --target=<bunTarget>`, the Go sidecar via `GOOS`/`GOARCH`, and
 * the daemon's native-prebuild closure (below) via a throwaway `bun install --os --cpu` root — see
 * `materializeCrossPlatformClosure`.
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
import { cpSync, existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { REPO } from '../../../../template.config'
import { SIDECARS, type SidecarManifestEntry } from './sidecars'

/**
 * Toolchain knowledge per declared target — platform data, not repo identity (correctly local).
 * ONE table for everything a target changes: the Tauri/Rust triple suffix, the TARGET's own
 * platform/arch (never read `process.platform`/`process.arch` for these once cross-compiling
 * exists — those two only ever name the HOST), the bun `--compile --target=` value, and the Go
 * `GOOS`/`GOARCH` pair. Total by construction (every declared key has every field) — adding a
 * target means adding one row here, never an `if` at a call site.
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

export interface CliArgs {
	target?: TargetKey
}

/** Pure argv parser — closed-set validation happens HERE (not deferred to a later branch), so an
 *  unknown `--target` value fails with the same message whether it came from a human or CI. */
export function parseCliArgs(argv: readonly string[]): CliArgs {
	let target: TargetKey | undefined
	for (let i = 0; i < argv.length; i += 2) {
		const flag = argv[i]
		const value = argv[i + 1]
		if (flag === undefined) break
		if (value === undefined || value.startsWith('--')) throw new Error(`flag with no value: ${flag}`)
		switch (flag) {
			case '--target':
				if (!isTargetKey(value)) {
					throw new Error(`unknown --target '${value}' — expected one of: ${Object.keys(TARGETS).join(', ')}`)
				}
				target = value
				break
			default:
				throw new Error(`unknown flag: ${flag}`)
		}
	}
	return { target }
}

/** No `--target` ⇒ the host, exactly like before this file learned to cross-compile — but the host
 *  itself must be a declared TARGETS row, or there is nothing to fall back to. */
export function resolveTargetKey(argv: readonly string[], hostKey: string): TargetKey {
	const { target } = parseCliArgs(argv)
	if (target) return target
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
 * `nativePrebuild` is the OTHER declared table this file's cross-target support needs: libsql's
 * native-prebuild optional-dep name per target, keyed the SAME as TARGETS (the `satisfies` below
 * makes a target added to TARGETS without a row here a tsc error — total by construction, same
 * discipline as TARGETS itself). Not derived from the triple string: Linux ships BOTH gnu/musl
 * prebuilds and this repo standardizes on gnu, matching TARGETS' own `...-unknown-linux-gnu` triple.
 *
 * This same table now ALSO drives the staging walk's filter (`shouldStageOptionalDependency`,
 * below `resolveStagedRoots`): `bun install`'s os/cpu matching resolves every libc variant for a
 * given os+cpu (no libc axis in its optional-dep gate), so a linux-x64-gnu HOST resolves
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
 * the given TARGET (host or cross, uniformly — never an `if (target === 'win32-x64')` here).
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
 *   then dies inside linuxdeploy. Applies uniformly to the host path AND the cross path
 *   (`materializeCrossPlatformClosure`'s scratch install) because both funnel through this same
 *   walk — no separate cross-only special case.
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
 * Runtime closure of a declared package, resolved FROM a given root (host workspace or the cross-
 * target scratch dir below — one staging function, two roots, one filter). Walking
 * `optionalDependencies` is the POINT, not a nicety: the native prebuild (`@libsql/darwin-arm64`, …)
 * is an optional dep of `libsql`, and walking it is what keeps this file from naming a triple at the
 * call site. Absent optionals are the OTHER platforms' prebuilds — skipped, not an error.
 * `dependencies` are walked too so a staged package is never half-copied. `@types/*` are type-only
 * and skipped. Every optional dep is additionally run through `shouldStageOptionalDependency`
 * (defect B, see its own doc) BEFORE the resolve attempt — a family member that isn't this target's
 * declared prebuild is skipped outright, never even probed.
 *
 * CROSS-TRIPLE GAP — CLOSED for declared targets. It used to be: `bun install`'s ambient
 * node_modules only ever holds the HOST's optional prebuild, so walking it from the workspace for a
 * cross-target build would stage a binary that COMPILES and then dies at runtime with a missing
 * `@libsql/<target-triple>`. The fix (`materializeCrossPlatformClosure`, below `buildSidecars`):
 * for any target that ISN'T the host, seed a throwaway package.json — `DAEMON_RUNTIME.packages` at
 * the version `core/package.json` pins them to, never a re-typed literal — into a scratch dir, then
 * run `bun install --os=<platform> --cpu=<arch>` there (bun ≥1.3). Those two flags make bun fetch
 * the TARGET's optional prebuild instead of the host's; THIS function then walks the scratch dir
 * exactly like it walks the workspace for a host build. `DAEMON_RUNTIME.nativePrebuild` asserts the
 * right prebuild actually landed, per target, so a silent miss fails the build loud instead of
 * shipping a binary that dies on first connect.
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

/** Pure lookup + fail-loud: pulls the pinned version string for each `packages` entry out of an
 *  already-parsed package.json. Never a re-typed literal — `@libsql/client`'s range lives in
 *  exactly one place, `core/package.json`, and this is the only reader for cross-target staging. */
export function pickDependencyVersions(
	manifest: { dependencies?: Record<string, string> },
	packages: readonly string[],
	sourceLabel: string,
): Record<string, string> {
	const versions: Record<string, string> = {}
	for (const pkg of packages) {
		const version = manifest.dependencies?.[pkg]
		if (version === undefined) {
			throw new Error(`'${pkg}' is not a declared dependency in ${sourceLabel} — cannot pin a cross-target version`)
		}
		versions[pkg] = version
	}
	return versions
}

/**
 * Materializes, for a target that is NOT the host, a node_modules closure resolvable the same way
 * the host path resolves one — see the CROSS-TRIPLE GAP note on `resolveStagedRoots` above. Network
 * + minutes (bun fetches the target's prebuild from the registry), so this is exercised by the real
 * cross build (CI / the local proof), never by the unit-test lane.
 */
async function materializeCrossPlatformClosure(target: TargetSpec, packages: readonly string[], coreDir: string): Promise<string> {
	const corePkgJsonPath = join(coreDir, 'package.json')
	const coreManifest = JSON.parse(readFileSync(corePkgJsonPath, 'utf-8')) as { dependencies?: Record<string, string> }
	const versions = pickDependencyVersions(coreManifest, packages, corePkgJsonPath)

	const scratchDir = mkdtempSync(join(tmpdir(), 'codm-sidecar-cross-'))
	const manifest = { name: 'codm-sidecar-cross-scratch', private: true, dependencies: versions }
	writeFileSync(join(scratchDir, 'package.json'), JSON.stringify(manifest, null, 2))
	await run(`cross-install(${target.platform}-${target.arch})`, ['bun', 'install', `--os=${target.platform}`, `--cpu=${target.arch}`], scratchDir)
	return scratchDir
}

export async function buildSidecars(targetKey: TargetKey): Promise<void> {
	const target = TARGETS[targetKey]
	const hostKey = resolveHostKey(process.platform, process.arch)
	const isCrossTarget = targetKey !== hostKey

	const pkgRoot = join(import.meta.dir, '..')
	const repoRoot = join(pkgRoot, '..', '..', '..')
	const outDir = join(pkgRoot, 'src-tauri', 'binaries')
	mkdirSync(outDir, { recursive: true })
	// The TARGET's own extension — never `process.platform`, which only ever names the HOST.
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
	// sidecar's own workspace for a HOST build, or from a throwaway `bun install --os --cpu` root for
	// a cross-target one (materializeCrossPlatformClosure — see the CROSS-TRIPLE GAP note above).
	// Copied FLAT into `binaries/daemon-runtime/node_modules/<pkg>` so the binary's CWD walk-up finds
	// the entry point AND every sibling it requires. `dereference` turns the .bun-store symlinks (or,
	// for a scratch root, the bun install symlinks) into real files that survive bundling.
	const daemon = SIDECARS.find(s => s.role === DAEMON_RUNTIME.role)
	if (daemon === undefined) {
		console.error(`[sidecars] DAEMON_RUNTIME names unknown sidecar role '${DAEMON_RUNTIME.role}'`)
		process.exit(1)
		return
	}
	const coreDir = join(repoRoot, REPO.workspaces[daemon.build.workspace].pkgRoot, DAEMON_RUNTIME.resolveFrom)
	const runtimeDest = join(outDir, DAEMON_RUNTIME.subpath, 'node_modules')
	rmSync(runtimeDest, { recursive: true, force: true })

	const stagingRoot = isCrossTarget ? await materializeCrossPlatformClosure(target, DAEMON_RUNTIME.packages, coreDir) : coreDir
	const roots = resolveStagedRoots(DAEMON_RUNTIME.packages, stagingRoot, targetKey)
	try {
		for (const [name, root] of roots) {
			cpSync(root, join(runtimeDest, name), { recursive: true, dereference: true })
			if (!existsSync(join(runtimeDest, name))) {
				console.error(`[sidecars] failed to stage node module '${name}' into ${DAEMON_RUNTIME.subpath}`)
				process.exit(1)
			}
		}
	} finally {
		if (isCrossTarget) rmSync(stagingRoot, { recursive: true, force: true })
	}
	console.log(`[sidecars] staged ${roots.size} node modules → src-tauri/binaries/${DAEMON_RUNTIME.subpath}/node_modules/`)

	// Windows (or any declared target's) staged prebuild sanity: a closure that copied fine can still
	// be missing the ONE package that actually opens the database, if the target's optional-dep
	// filter silently matched nothing (wrong --os/--cpu spelling, a libsql release that drops a
	// platform). Fail loud, naming the gap, instead of shipping a sidecar that dies on first connect.
	const expectedNativePkg = DAEMON_RUNTIME.nativePrebuild[targetKey]
	if (!existsSync(join(runtimeDest, expectedNativePkg))) {
		console.error(
			`[sidecars] cross-target staging gap: '${expectedNativePkg}' missing from ${DAEMON_RUNTIME.subpath}/node_modules — the ${targetKey} daemon would compile clean and die on first connect`,
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
	// which is authoritative and was just rebuilt. Target-independent: this purges a LOCAL cargo
	// cache dir, unrelated to which triple was just built.
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

// Run as a standalone script (`bun config/build-sidecars.ts [--target <key>]`) — the package
// "sidecars" script and the nx `sidecars` target both invoke it this way (no flag, host behavior
// unchanged). Importing the module (e.g. for SIDECARS/TARGETS types, or the pure parsers under
// test) does NOT trigger a build.
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
