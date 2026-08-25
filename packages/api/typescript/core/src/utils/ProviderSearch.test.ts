import { afterEach, beforeEach, describe, expect, it } from 'bun:test'
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { PROVIDER_SEARCH, resolveBinary, type ProviderSearchEnv } from './ProviderSearch'

/**
 * The per-platform search table against a temp-dir fixture: the table is a function of (platform,
 * home, env), never of `process`, so the win32 row is testable from a POSIX host. Two hermeticity
 * rules keep these tests honest:
 *
 * - Every `resolveBinary` call uses a fixture-only command name (`fixture-provider-cli`), NEVER a
 *   real CLI's name: the POSIX rows' knownDirs include REAL absolute system dirs (`/usr/local/bin`,
 *   `/opt/homebrew/bin`), so a literal `claude` would leak the host machine's actual install into a
 *   `toBeNull()` assertion — deterministic failure on any machine with claude installed there.
 * - The one assertion that needs `accessSync X_OK` to REJECT a file (no exec bit) is guarded with
 *   `describe.skipIf(process.platform === 'win32')` — on Windows X_OK degrades to F_OK, which is
 *   exactly why the win32 row never offers the bare name.
 */

const CLI = 'fixture-provider-cli'

let root: string

const dir = (...segments: string[]): string => {
	const path = join(root, ...segments)
	mkdirSync(path, { recursive: true })
	return path
}
/** An executable file. `mode` is what the exec bit is on POSIX — on Windows the extension is the bit. */
const executable = (at: string, name: string): string => {
	const path = join(at, name)
	writeFileSync(path, '#!/bin/sh\n', { mode: 0o755 })
	return path
}
const plainFile = (at: string, name: string): string => {
	const path = join(at, name)
	writeFileSync(path, 'not executable\n', { mode: 0o644 })
	return path
}
const env = (vars: Record<string, string>, home = root): ProviderSearchEnv => ({ home, env: vars })

beforeEach(() => {
	root = mkdtempSync(join(tmpdir(), 'provider-search-fixture-'))
})
afterEach(() => {
	rmSync(root, { recursive: true, force: true })
})

describe('resolveBinary — darwin/linux rows (POSIX)', () => {
	it('finds an executable on PATH and returns its absolute path', () => {
		const bin = dir('bin')
		const found = executable(bin, CLI)
		expect(resolveBinary(CLI, PROVIDER_SEARCH.darwin, env({ PATH: bin }))).toBe(found)
	})

	it('splits PATH on the DECLARED delimiter and honours entry order', () => {
		const first = dir('first')
		const second = dir('second')
		const winner = executable(first, CLI)
		executable(second, CLI)
		expect(resolveBinary(CLI, PROVIDER_SEARCH.linux, env({ PATH: `${first}:${second}` }))).toBe(winner)
	})

	describe.skipIf(process.platform === 'win32')('exec bit / directory rejection (POSIX X_OK semantics)', () => {
		it('skips a file without the exec bit and a DIRECTORY with the binary’s name', () => {
			const bin = dir('bin')
			plainFile(bin, CLI) // needs X_OK to reject
			dir('dirs', CLI) // a directory named like the binary — `access(X_OK)` alone would accept it
			expect(resolveBinary(CLI, PROVIDER_SEARCH.darwin, env({ PATH: `${bin}:${join(root, 'dirs')}` }))).toBeNull()
		})
	})

	it('falls back to the known install dirs under HOME when PATH has nothing (darwin: ~/.claude/local)', () => {
		const local = dir('.claude', 'local')
		const found = executable(local, CLI)
		expect(resolveBinary(CLI, PROVIDER_SEARCH.darwin, env({ PATH: dir('empty') }))).toBe(found)
	})

	it('linux knows the npm-global prefix (~/.npm-global/bin) — darwin does not need to', () => {
		const npmGlobal = dir('.npm-global', 'bin')
		const found = executable(npmGlobal, CLI)
		expect(resolveBinary(CLI, PROVIDER_SEARCH.linux, env({ PATH: '' }))).toBe(found)
		expect(resolveBinary(CLI, PROVIDER_SEARCH.darwin, env({ PATH: '' }))).toBeNull()
	})

	it('PATH wins over the known dirs', () => {
		const bin = dir('bin')
		const onPath = executable(bin, CLI)
		executable(dir('.local', 'bin'), CLI)
		expect(resolveBinary(CLI, PROVIDER_SEARCH.linux, env({ PATH: bin }))).toBe(onPath)
	})

	it('returns null when PATH is unset and nothing is installed', () => {
		expect(resolveBinary(CLI, PROVIDER_SEARCH.linux, env({}))).toBeNull()
	})
})

describe('resolveBinary — win32 row', () => {
	it('resolves through PATHEXT: a bare name (the npm bash shim) is IGNORED, `.exe` is found', () => {
		const bin = dir('bin')
		executable(bin, CLI) // extensionless shim — not a Windows executable
		const exe = executable(bin, `${CLI}.exe`)
		expect(resolveBinary(CLI, PROVIDER_SEARCH.win32, env({ PATH: bin, PATHEXT: '.COM;.EXE;.BAT;.CMD' }))).toBe(exe)
	})

	it('tries the extensions in PATHEXT order — .exe before .cmd when both exist', () => {
		const bin = dir('bin')
		executable(bin, `${CLI}.cmd`)
		const exe = executable(bin, `${CLI}.exe`)
		expect(resolveBinary(CLI, PROVIDER_SEARCH.win32, env({ PATH: bin, PATHEXT: '.COM;.EXE;.BAT;.CMD' }))).toBe(exe)
		// And the OTHER way round when the machine's PATHEXT says so: the order is the OS's, not ours.
		expect(resolveBinary(CLI, PROVIDER_SEARCH.win32, env({ PATH: bin, PATHEXT: '.CMD;.EXE' }))).toBe(join(bin, `${CLI}.cmd`))
	})

	it('uses the Windows default PATHEXT when the variable is unset', () => {
		const bin = dir('bin')
		const exe = executable(bin, `${CLI}.exe`)
		expect(resolveBinary(CLI, PROVIDER_SEARCH.win32, env({ PATH: bin }))).toBe(exe)
	})

	it('splits PATH on `;` regardless of the host', () => {
		const first = dir('first')
		const second = dir('second')
		const exe = executable(second, `${CLI}.exe`)
		expect(resolveBinary(CLI, PROVIDER_SEARCH.win32, env({ PATH: `${first};${second}`, PATHEXT: '.EXE' }))).toBe(exe)
	})

	it('knows %APPDATA%\\npm and %LOCALAPPDATA%\\Programs when those variables exist, and skips them when they do not', () => {
		const appData = dir('AppData', 'Roaming')
		const cmd = executable(dir('AppData', 'Roaming', 'npm'), `${CLI}.cmd`)
		expect(resolveBinary(CLI, PROVIDER_SEARCH.win32, env({ PATH: '', PATHEXT: '.EXE;.CMD', APPDATA: appData }))).toBe(cmd)

		const localAppData = dir('AppData', 'Local')
		const exe = executable(dir('AppData', 'Local', 'Programs'), `${CLI}.exe`)
		expect(resolveBinary(CLI, PROVIDER_SEARCH.win32, env({ PATH: '', PATHEXT: '.EXE', LOCALAPPDATA: localAppData }))).toBe(exe)

		// Neither variable → neither dir is even a candidate.
		expect(resolveBinary(CLI, PROVIDER_SEARCH.win32, env({ PATH: '', PATHEXT: '.EXE;.CMD' }))).toBeNull()
	})

	it('knows the native installer’s home (~/.local/bin/<name>.exe) and ~/.claude/local, like POSIX', () => {
		const exe = executable(dir('.local', 'bin'), `${CLI}.exe`)
		expect(resolveBinary(CLI, PROVIDER_SEARCH.win32, env({ PATH: '', PATHEXT: '.EXE' }))).toBe(exe)
	})
})

describe('PROVIDER_SEARCH — the declared platform → search relation', () => {
	it('declares the delimiter and the extensions per platform, never read from the host', () => {
		expect(PROVIDER_SEARCH.win32.pathDelimiter).toBe(';')
		expect(PROVIDER_SEARCH.darwin.pathDelimiter).toBe(':')
		expect(PROVIDER_SEARCH.linux.pathDelimiter).toBe(':')
		expect(PROVIDER_SEARCH.darwin.extensions(env({}))).toEqual([''])
		expect(PROVIDER_SEARCH.win32.extensions(env({ PATHEXT: '.COM;.EXE' }))).toEqual(['.com', '.exe'])
	})

	it('keeps today’s macOS list verbatim (Homebrew included)', () => {
		expect(PROVIDER_SEARCH.darwin.knownDirs(env({}, '/Users/x'))).toEqual([
			join('/Users/x', '.claude', 'local'),
			join('/Users/x', '.local', 'bin'),
			join('/Users/x', '.bun', 'bin'),
			'/usr/local/bin',
			'/opt/homebrew/bin',
		])
	})

	it('covers the platform this test is running on — the lookup in SystemProviderDetector can never be undefined', () => {
		expect(PROVIDER_SEARCH[process.platform]).toBeDefined()
	})
})
