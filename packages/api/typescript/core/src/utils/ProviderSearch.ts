import { accessSync, constants, statSync } from 'node:fs'
import { join } from 'node:path'

/**
 * WHERE each platform keeps CLIs and WHAT an executable is called there — the search half of
 * provider detection, as a DECLARED relation platform → spec (`PROVIDER_SEARCH`), consumed by ONE
 * lookup in `SystemProviderDetector`. No `if (platform === …)` anywhere: a platform that differs
 * differs in its ROW, not in a branch of the walk.
 *
 * Everything host-specific is a parameter (`ProviderSearchEnv`: home + env) or a declared field
 * (`pathDelimiter`), never read from `process` here — which is what lets the win32 row be tested on
 * a Mac against a temp-dir fixture (`ProviderSearch.test.ts`). The only host facts the walk uses are
 * `join` (a separator) and the exec bit, both of which every candidate has on every host.
 */
export interface ProviderSearchEnv {
	/** The user's home — `os.homedir()` in production. */
	readonly home: string
	/** The process environment (`PATH`, `PATHEXT`, `APPDATA`, …) — `process.env` in production. */
	readonly env: NodeJS.ProcessEnv
}

export interface ProviderSearchSpec {
	/** Separator of the PATH variable on this platform — declared so a row is testable from any host. */
	readonly pathDelimiter: ':' | ';'
	/** Suffixes to try for a binary name, IN ORDER. `''` means the bare name. */
	extensions(env: ProviderSearchEnv): readonly string[]
	/** Install locations checked AFTER `PATH`, in order — where the provider CLIs commonly land. */
	knownDirs(env: ProviderSearchEnv): readonly string[]
}

/** A POSIX row: `:`-separated PATH, the bare name is the executable. */
const unix = (knownDirs: ProviderSearchSpec['knownDirs']): ProviderSearchSpec => ({
	pathDelimiter: ':',
	extensions: () => [''],
	knownDirs,
})

/** Today's macOS list, verbatim — the native installer, XDG, bun, and both Homebrew prefixes. */
const darwinSearch = unix(({ home }) => [
	join(home, '.claude', 'local'),
	join(home, '.local', 'bin'),
	join(home, '.bun', 'bin'),
	'/usr/local/bin',
	'/opt/homebrew/bin',
])

/** Linux (and every other unix-like): same as macOS minus Homebrew, plus the npm-global prefix. */
const linuxSearch = unix(({ home }) => [
	join(home, '.claude', 'local'),
	join(home, '.local', 'bin'),
	join(home, '.bun', 'bin'),
	join(home, '.npm-global', 'bin'),
	'/usr/local/bin',
])

/** What Windows itself assumes when `PATHEXT` is unset. */
const DEFAULT_PATHEXT = '.COM;.EXE;.BAT;.CMD'

/**
 * `%VAR%`-rooted install dirs: `[env key, ...path segments]`. A variable that is absent simply
 * contributes no dir — there is no "Windows without APPDATA" branch, only an empty row.
 */
const WINDOWS_ENV_DIRS: readonly (readonly [string, ...string[]])[] = [
	['LOCALAPPDATA', 'Programs'],
	['APPDATA', 'npm'],
]

/**
 * Windows: `;`-separated PATH; an executable is `name + one of PATHEXT`, in PATHEXT's own order —
 * the bare name is deliberately NOT a candidate (the npm shim `claude` beside `claude.cmd` is a bash
 * script no Windows loader can run). Extensions are lowercased only so the reported path reads
 * `claude.exe` rather than `claude.EXE`; NTFS does not care.
 *
 * knownDirs order: home-rooted dirs first (the native installer's `~/.local/bin/claude.exe`
 * outranks npm shims), then the `%VAR%`-rooted ones.
 */
const windowsSearch: ProviderSearchSpec = {
	pathDelimiter: ';',
	extensions: ({ env }) =>
		(env.PATHEXT ?? DEFAULT_PATHEXT)
			.split(';')
			.filter(Boolean)
			.map(ext => ext.toLowerCase()),
	knownDirs: ({ home, env }) => [
		join(home, '.claude', 'local'),
		// The native installer (`install.ps1`) lands `claude.exe` here — same path shape as POSIX.
		join(home, '.local', 'bin'),
		join(home, '.bun', 'bin'),
		...WINDOWS_ENV_DIRS.flatMap(([key, ...segments]) => {
			const base = env[key]
			return base ? [join(base, ...segments)] : []
		}),
	],
}

/**
 * The declared relation platform → search spec. `Record<NodeJS.Platform, …>` and not a partial map
 * with a fallback: every platform Node can report is listed, so a new member of the union is a
 * `tsc` error here (same discipline as `PROVIDER_BINARIES`).
 */
export const PROVIDER_SEARCH: Record<NodeJS.Platform, ProviderSearchSpec> = {
	aix: linuxSearch,
	android: linuxSearch,
	darwin: darwinSearch,
	freebsd: linuxSearch,
	haiku: linuxSearch,
	linux: linuxSearch,
	openbsd: linuxSearch,
	sunos: linuxSearch,
	win32: windowsSearch,
	cygwin: linuxSearch,
	netbsd: linuxSearch,
}

/**
 * Portable `which` over a declared row: PATH entries first (split on the row's delimiter), then the
 * row's known dirs; in each, every extension in order. Returns the ABSOLUTE path of the first
 * executable FILE, or null.
 *
 * Runtime-agnostic on purpose — `node:fs` + `node:path` resolve identically under Bun and Node, so
 * this file makes no claim about which runtime hosts it (`Bun.which` would).
 */
export function resolveBinary(command: string, spec: ProviderSearchSpec, env: ProviderSearchEnv): string | null {
	const onPath = (env.env.PATH ?? '').split(spec.pathDelimiter).filter(Boolean)
	const extensions = spec.extensions(env)
	for (const dir of [...onPath, ...spec.knownDirs(env)]) {
		for (const ext of extensions) {
			const candidate = join(dir, `${command}${ext}`)
			if (isExecutableFile(candidate)) return candidate
		}
	}
	return null
}

/**
 * WHAT a spawned provider CLI's PATH is made of — the same declared relation, consumed for the
 * child's environment instead of for a search.
 *
 * The bug this closes: the CLI binary is FOUND (resolveBinary searches beyond PATH) and executed by
 * absolute path, but its `#!/usr/bin/env node` shebang then searches the CHILD's PATH — and a
 * daemon launched by Finder/launchd inherits little more than `/usr/bin:/bin:/usr/sbin:/sbin`, so
 * `env` answers `node: No such file or directory` and the exec dies with 127.
 */
export interface ChildPathSources {
	/** The PATH the parent itself inherited — under a Finder/launchd launch, nearly empty. */
	readonly basePath: string
	/**
	 * Directories the running process can VOUCH for: the one holding its own interpreter
	 * (`process.execPath`) and the one holding the binary being invoked — under nvm/fnm/volta/asdf
	 * and npm-global installs the provider shim and `node` live side by side, which is what makes
	 * this the entry that rescues those hosts.
	 */
	readonly runtimeDirs: readonly string[]
}

/**
 * Compose the PATH a child process should see: the inherited entries first (never shadow the
 * user's own resolution order), then the runtime dirs, then the row's declared known dirs.
 * Deduplicated, joined on the row's own delimiter. No existence probing — a dir that isn't there
 * is skipped by the OS lookup itself, and staying pure is what keeps this testable from any host.
 */
export function composeChildPath(spec: ProviderSearchSpec, env: ProviderSearchEnv, sources: ChildPathSources): string {
	const entries = [
		...sources.basePath.split(spec.pathDelimiter),
		...sources.runtimeDirs,
		...spec.knownDirs(env),
	].filter(Boolean)
	return [...new Set(entries)].join(spec.pathDelimiter)
}

/**
 * Exec bit AND a regular file. `access(X_OK)` alone accepts a DIRECTORY named like the binary
 * (search permission is `x`), and on Windows it degrades to `F_OK` — there the extension is the
 * exec bit, which is why the win32 row never offers the bare name.
 */
function isExecutableFile(path: string): boolean {
	try {
		accessSync(path, constants.X_OK)
		return statSync(path).isFile()
	} catch {
		return false
	}
}
